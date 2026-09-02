const { execFileSync } = require('node:child_process');

const checks = Object.freeze([
  { script: 'lint' },
  { script: 'typecheck' },
  { script: 'test', args: ['--', '--runInBand', '--ci'] },
  { script: 'verify:expo-compatibility' },
  { script: 'doctor', env: { EXPO_OFFLINE: '1' } },
  { script: 'verify:advisories' },
  { script: 'export:web' },
]);

function execute(check) {
  if (!process.env.npm_execpath) throw new Error('Run this script with npm run check.');
  execFileSync(process.execPath, [process.env.npm_execpath, 'run', check.script, ...(check.args || [])], {
    stdio: 'inherit',
    env: { ...process.env, ...check.env },
  });
}

function runChecks(run = execute) {
  for (const check of checks) {
    process.stdout.write(`[check] ${check.script}\n`);
    run(check);
  }
}

if (require.main === module) runChecks();
module.exports = { checks, runChecks };
