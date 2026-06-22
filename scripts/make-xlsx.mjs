// Generate the uploadable sample patient workbook from the shared seed set.
// Columns match parsePersonaRows in lib/triage-engine.js. Dev-only.
//
// The vendored SheetJS is a browser UMD bundle; under a bare Node require it
// takes a no-op branch, so we run it in a vm with browser-like globals and
// read the populated module.exports.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { SEED_PERSONAS } from '../lib/personas.js';

const require = createRequire(import.meta.url);
const code = readFileSync(new URL('../vendor/xlsx.full.min.js', import.meta.url), 'utf8');
const m = { exports: {} };
const sb = { module: m, exports: m.exports, require, process, Buffer, console };
sb.self = sb; sb.window = sb; sb.global = sb; sb.globalThis = sb;
vm.runInNewContext(code, sb);
const XLSX = m.exports;

const rows = SEED_PERSONAS.map((p) => ({
  id: p.id,
  display_name: p.display_name,
  age: p.age,
  sex: p.sex,
  complaint: p.complaint,
  expected_endpoint: p.expected_endpoint,
  affirms: p.affirms.join(' ; '),
  negates: p.negates.join(' ; '),
  clinical_truth: p.clinical_truth,
  personality: p.character.personality,
  health_literacy: p.character.health_literacy,
  emotional_state: p.character.emotional_state,
  speech_style: p.character.speech_style,
}));

const ws = XLSX.utils.json_to_sheet(rows);
ws['!cols'] = [
  { wch: 6 }, { wch: 14 }, { wch: 5 }, { wch: 8 }, { wch: 18 }, { wch: 20 },
  { wch: 52 }, { wch: 42 }, { wch: 62 }, { wch: 22 }, { wch: 24 }, { wch: 26 }, { wch: 24 },
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'patients');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(new URL('../clearstep-patients.xlsx', import.meta.url), buf);
console.log(`wrote clearstep-patients.xlsx with ${rows.length} patients`);
