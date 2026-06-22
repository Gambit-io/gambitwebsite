// Deterministic engine checks. No API key, no model calls, no tokens spent.
// Proves the parts that must be exactly right: ROUTE detection, severity
// scoring, transcript role mapping, and the 15-turn fail cap.
//
//   node scripts/test-engine-logic.mjs

import {
  parseRoute,
  scoreRun,
  toPatientMessages,
  toTriageMessages,
  runConversation,
  ENDPOINTS,
} from '../lib/triage-engine.js';
import { HEADACHE } from './fixtures.mjs';

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}
function eq(name, got, want) {
  check(`${name} (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));
}

console.log('\nparseRoute');
eq('commits on a trailing ROUTE line', parseRoute('A few questions.\nROUTE: Video visit'), 'Video visit');
eq('case-insensitive endpoint match', parseRoute('ROUTE: emergency department'), 'Emergency department');
eq('no marker means keep going', parseRoute('What other symptoms do you have?'), null);
eq('invalid endpoint is rejected', parseRoute('ROUTE: Walk it off'), null);
eq('takes the last ROUTE line', parseRoute('ROUTE: Urgent care\non reflection\nROUTE: Specialist'), 'Specialist');
eq('all five endpoints parse', ENDPOINTS.map((e) => parseRoute(`ROUTE: ${e}`)), ENDPOINTS);

console.log('\nscoreRun');
eq('correct match', scoreRun({ expected: 'Video visit', chosen: 'Video visit', failed: false }), { routing_correct: true, severity: 'correct' });
eq('under-triage is lower acuity', scoreRun({ expected: 'Emergency department', chosen: 'Urgent care', failed: false }), { routing_correct: false, severity: 'under-triage' });
eq('over-triage is higher acuity', scoreRun({ expected: 'Self-care at home', chosen: 'Urgent care', failed: false }), { routing_correct: false, severity: 'over-triage' });
eq('failed run scores as fail', scoreRun({ expected: 'Video visit', chosen: null, failed: true }), { routing_correct: false, severity: 'fail' });

console.log('\nrole mapping (Anthropic needs first and last to be user turns)');
// At a patient call site the transcript ends on a triage question.
const patientSite = [
  { speaker: 'patient', text: 'my head really hurts' },
  { speaker: 'triage', text: 'How long has it lasted?' },
  { speaker: 'patient', text: 'since this morning' },
  { speaker: 'triage', text: 'Any vision changes?' },
];
const pm = toPatientMessages(patientSite);
check('patient view starts on user', pm[0].role === 'user');
check('patient view ends on user', pm[pm.length - 1].role === 'user');
check('patient view alternates roles', pm.every((m, i) => i === 0 || m.role !== pm[i - 1].role));
check('patient own turns are assistant (after the kickoff)', pm[1].role === 'assistant' && pm[1].content === 'my head really hurts');

// At a triage call site the transcript ends on a patient answer.
const triageSite = [
  { speaker: 'patient', text: 'my head really hurts' },
  { speaker: 'triage', text: 'How long has it lasted?' },
  { speaker: 'patient', text: 'since this morning' },
];
const tm = toTriageMessages(triageSite);
check('triage view starts on user', tm[0].role === 'user');
check('triage view ends on user', tm[tm.length - 1].role === 'user');
check('triage view alternates roles', tm.every((m, i) => i === 0 || m.role !== tm[i - 1].role));
check('triage own turns are assistant', tm[1].role === 'assistant' && tm[1].content === 'How long has it lasted?');
const firstPatient = toPatientMessages([]);
check('first patient call is a single user kickoff', firstPatient.length === 1 && firstPatient[0].role === 'user');

console.log('\nloop with a scripted triage (commits on the 4th question)');
{
  let triageCalls = 0;
  const scriptedCommitAt4 = async ({ system }) => {
    // Patient prompt contains the persona name; triage prompt does not.
    const isTriage = system.includes('clinical triage worker');
    if (!isTriage) return 'patient says something in character';
    triageCalls++;
    return triageCalls >= 4 ? 'Okay, I have enough.\nROUTE: Video visit' : `triage question ${triageCalls}`;
  };
  const result = await runConversation({
    persona: HEADACHE,
    callClaude: scriptedCommitAt4,
    models: { patient: 'm', triage: 'm' },
  });
  eq('commits to the scripted endpoint', result.chosen, 'Video visit');
  check('did not fail', result.failed === false);
  eq('stopped at turn 4', result.turns, 4);
  // opening + 4 triage + 3 patient answers = 8 entries
  eq('transcript length', result.transcript.length, 8);
  check('last entry is the committing triage turn', result.transcript[result.transcript.length - 1].speaker === 'triage');
}

console.log('\nloop that never commits (hits the 15-turn cap)');
{
  const neverCommits = async ({ system }) =>
    system.includes('clinical triage worker') ? 'one more question please' : 'patient answer';
  const result = await runConversation({
    persona: HEADACHE,
    callClaude: neverCommits,
    models: { patient: 'm', triage: 'm' },
  });
  check('no endpoint chosen', result.chosen === null);
  check('marked as failed', result.failed === true);
  eq('ran exactly 15 turns', result.turns, 15);
  eq('scores as fail', scoreRun({ expected: HEADACHE.expected_endpoint, chosen: result.chosen, failed: result.failed }), { routing_correct: false, severity: 'fail' });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
