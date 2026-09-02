import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as canonical from './components';

describe('V2.2 design-system boundary', () => {
  it('exposes the complete canonical component boundary', () => {
    expect(Object.keys(canonical)).toEqual(expect.arrayContaining([
      'AppMasthead', 'PhaseBand', 'SegmentedRail', 'RuledHeader',
      'StatusActionBand', 'OrdinalRow', 'CommandButton', 'IconCommand',
      'ChoiceControl', 'TrainingField', 'OperationalSection',
      'BottomCommandDock', 'FocusedSheet',
    ]));
  });
  it('rejects a deliberately prohibited production import', () => {
    const fixture = mkdtempSync(resolve(tmpdir(), 'sr22c-boundary-'));
    mkdirSync(resolve(fixture, 'src/app'), { recursive: true });
    mkdirSync(resolve(fixture, 'src/features'), { recursive: true });
    writeFileSync(resolve(fixture, 'src/app/witness.tsx'), "import { Screen } from '@/design-system/primitives';\n");
    const verifier = resolve(__dirname, '../../../scripts/verify-v2.2-design-boundary.mjs');
    const result = spawnSync(process.execPath, [verifier, fixture], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('src/app/witness.tsx');
  });
});
