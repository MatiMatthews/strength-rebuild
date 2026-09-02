import fs from 'node:fs';
import path from 'node:path';

import { checks, runChecks } from '../check.cjs';

describe('development checks', () => {
  it('runs declared package scripts in order, with tests and offline diagnostics', () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).scripts;
    const executed: string[] = [];
    runChecks((check: { script: string }) => {
      expect(scripts[check.script]).toEqual(expect.any(String));
      executed.push(check.script);
    });
    expect(executed).toEqual(['lint', 'typecheck', 'test', 'verify:expo-compatibility', 'doctor', 'verify:advisories', 'export:web']);
    expect(checks.find((check: { script: string }) => check.script === 'test').args).toEqual(['--', '--runInBand', '--ci']);
    expect(checks.find((check: { script: string }) => check.script === 'doctor').env).toEqual({ EXPO_OFFLINE: '1' });
  });

  it('does not continue after a failing check', () => {
    const executed: string[] = [];
    expect(() => runChecks((check: { script: string }) => {
      executed.push(check.script);
      if (check.script === 'typecheck') throw new Error('type error');
    })).toThrow('type error');
    expect(executed).toEqual(['lint', 'typecheck']);
  });
});
