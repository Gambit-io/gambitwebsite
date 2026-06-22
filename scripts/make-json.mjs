// Generate the uploadable sample patient set as JSON, in the exact persona
// shape the client spec uses. Dev-only.
import { writeFileSync } from 'node:fs';
import { SEED_PERSONAS } from '../lib/personas.js';

writeFileSync(new URL('../clearstep-patients.json', import.meta.url), JSON.stringify(SEED_PERSONAS, null, 2) + '\n');
console.log(`wrote clearstep-patients.json with ${SEED_PERSONAS.length} patients`);
