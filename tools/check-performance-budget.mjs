// Check the candidate's mobile Lighthouse medians (comparison.json written by
// tools/performance-summary.mjs) against tools/performance-budget.json.
// Prints a Markdown table for the job summary and exits 1 when a value is over budget.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, budgetPath = 'tools/performance-budget.json'] = process.argv.slice(2);
if (!dir) throw new Error('Usage: node tools/check-performance-budget.mjs <performance dir> [budget.json]');
const { budget } = JSON.parse(readFileSync(budgetPath, 'utf8'));
const { candidate } = JSON.parse(readFileSync(join(dir, 'comparison.json'), 'utf8'));
if (!candidate?.median) throw new Error('comparison.json has no candidate medians');
const show = (key, value) => (key === 'jsBytes' ? `${(value / 1024).toFixed(1)} KiB` : key === 'cls' ? value.toFixed(3) : String(Math.round(value)));
const rows = [];
let failed = 0;
for (const [key, limit] of Object.entries(budget)) {
  const value = candidate.median[key];
  if (typeof value !== 'number') throw new Error(`comparison.json has no candidate median for ${key}`);
  const ok = (limit.min === undefined || value >= limit.min) && (limit.max === undefined || value <= limit.max);
  if (!ok) failed++;
  const bound = limit.min !== undefined ? `>= ${show(key, limit.min)}` : `<= ${show(key, limit.max)}`;
  rows.push(`|${key}|${show(key, value)}|${bound}|${ok ? 'ok' : 'OVER BUDGET'}|`);
}
console.log('\nMobile performance budget (candidate medians):\n');
console.log('|Metric|Candidate|Budget|Result|\n|---|---:|---:|---|');
for (const row of rows) console.log(row);
if (failed) {
  console.error(`${failed} mobile performance budget item(s) failed; see ${budgetPath}.`);
  process.exitCode = 1;
}
