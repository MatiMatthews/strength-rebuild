const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const output = path.resolve('test-results', 'fault-proofs');
mkdirSync(output, { recursive: true });
for (const [fault, expected] of [['blocked-route', 'plan-screen'], ['memory-only', 'Revisar preparación para entrenar']]) {
  const run = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--output', path.join(output, fault)], {
    env: { ...process.env, JOURNEY_FAULT: fault }, encoding: 'utf8', timeout: 240_000,
  });
  const log = `${run.stdout || ''}\n${run.stderr || ''}`;
  writeFileSync(path.join(output, `${fault}.log`), log);
  if (run.status !== 1 || !log.includes(expected) || !log.includes('1 failed')) {
    process.stderr.write(log);
    throw new Error(`${fault}: expected a consumer assertion failure, got ${run.status}`);
  }
  console.log(`${fault}: detected by mandatory smoke (expected exit 1)`);
}
