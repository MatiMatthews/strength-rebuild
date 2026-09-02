import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { evaluateAdvisories, findingsFromNpmAudit } = require('./advisory-policy.cjs');

function main() {
  const auditRun = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (!auditRun.stdout) throw new Error(`npm audit produced no JSON: ${auditRun.stderr}`);
  const audit = JSON.parse(auditRun.stdout);
  const policy = JSON.parse(readFileSync(new URL('../security/advisory-policy.json', import.meta.url), 'utf8'));
  const result = evaluateAdvisories(findingsFromNpmAudit(audit), policy);
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Advisory policy passed for ${findingsFromNpmAudit(audit).length} high/moderate advisory paths.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
