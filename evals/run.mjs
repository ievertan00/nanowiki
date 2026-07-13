import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonObject, validateShape } from '../src/llm-runtime.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(fs.readFileSync(path.join(root, 'cases.json'), 'utf8'));
const results = cases.map(item => {
  let accepted = false;
  try { accepted = validateShape(parseJsonObject(item.output), item.shape).length === 0; } catch { accepted = false; }
  return { id: item.id, passed: accepted === item.expected };
});
const passed = results.filter(result => result.passed).length;
console.log(`Eval: ${passed}/${results.length} passed`);
for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}`);
if (passed !== results.length) process.exitCode = 1;
