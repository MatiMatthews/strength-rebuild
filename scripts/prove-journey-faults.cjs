const { spawnSync } = require('node:child_process');
const { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = process.cwd();
const output = path.join(root, 'test-results', 'fault-proofs');
mkdirSync(output, { recursive: true });
const service = 'src/application/workouts/workout-service.ts';
const faults = [
  { name: 'blocked-route', expected: 'plan-screen', transport: true },
  { name: 'memory-only', expected: 'Revisar preparación para entrenar', transport: true },
  ...['load', 'reps', 'notes', 'disposition'].map(field => ({
    name: `stored-${field}`, expected: 'Canonical completed-set values must persist',
    anchor: '  async saveDraftSnapshot(draft: WorkoutDraft): Promise<void> {',
    code: `\n    draft = { ...draft, exercises: draft.exercises.map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, ${field}: ${JSON.stringify(field === 'disposition' ? 'PENDING' : 'corrupted')} })) })) };`,
  })),
  ...[
    ['load', 'Carga de la serie 1', "load: '99'"],
    ['reps', 'Repeticiones de la serie 1', "reps: '99'"],
    ['notes', 'Notas de la serie 1', "notes: 'corrupted'"],
    ['completion', 'COMPLETADA', "completed: false, disposition: 'PENDING'"],
    ['identity', 'after.workouts.map', null],
  ].map(([name, expected, fields]) => ({
    name: `reopened-${name}`, expected,
    anchor: '      const draft = JSON.parse(active.actual_snapshot_json) as WorkoutDraft;',
    code: fields
      ? `\n      for (const exercise of draft.exercises) for (const set of exercise.sets) Object.assign(set, { ${fields} });`
      : `\n      await this.db.runAsync('UPDATE workout_session SET id = ? WHERE id = ?', draft.id + '-corrupted', draft.id);\n      draft.id += '-corrupted';`,
  })),
];
const catalogService = 'src/domain/prescriptions/catalog-requirements.ts';
const catalogFaults = [
  {
    name: 'catalog-equipment-bypass', expected: 'Missing equipment must reject the exact requirement',
    anchor: "return (!equipment || exercise.equipment.every((item) => equipment.has(item)))",
    replacement: 'return true',
  },
  {
    name: 'catalog-impact-bypass', expected: 'Impact restriction must reject the power requirement',
    anchor: "if (restriction === 'sin impacto') return exercise.impact === 'none';",
    replacement: "if (restriction === 'sin impacto') return true;",
  },
  {
    name: 'catalog-field-identity', expected: 'Invalid requirement must identify its field',
    anchor: 'Requisito ${requirementIndex + 1} (${kind}: ${value}):',
    replacement: 'Requisito inválido:',
  },
].map(fault => ({ ...fault, file: catalogService, test: 'requirements.spec.ts' }));
const activationFaults = [
  {
    name: 'catalog-resolution-order', file: catalogService, grep: 'multiple compatible candidates',
    anchor: 'left.id.localeCompare(right.id)', replacement: 'right.id.localeCompare(left.id)',
    expected: 'Chosen requirement kinds must resolve to deterministic catalog IDs',
  },
  {
    name: 'activation-session-prescription', grep: 'original choices', file: 'src/application/programs/program-service.ts',
    anchor: '      await this.validateActivation(id);',
    code: `
      const plans = await this.db.getAllAsync<{ id: string; snapshot_json: string }>(
        'SELECT s.id, s.snapshot_json FROM session_plan s JOIN training_week w ON w.id = s.training_week_id WHERE w.cycle_id = ?', id,
      );
      for (const plan of plans) {
        const snapshot = JSON.parse(plan.snapshot_json);
        snapshot.exercises[0].target.reps.min = 99;
        await this.db.runAsync('UPDATE session_plan SET snapshot_json = ? WHERE id = ?', JSON.stringify(snapshot), plan.id);
      }`,
    expected: 'Activation must preserve previewed session prescriptions',
  },
].map(fault => ({ ...fault, test: 'requirements.spec.ts' }));
const group = process.argv[2];
if (group && !['--catalog', '--activation'].includes(group)) throw new Error(`Unknown fault group: ${group}`);
const selectedFaults = group === '--catalog' ? catalogFaults : group === '--activation' ? activationFaults : [...faults, ...catalogFaults, ...activationFaults];
const results = [];
for (const fault of selectedFaults) {
  // Every mutant owns a disposable source/export copy. Never patch the working
  // tree, baseline export, real browser profile or pre-existing SQLite database.
  const copy = mkdtempSync(path.join(os.tmpdir(), 'strength-journey-mutant-'));
  try {
    const excluded = new Set(['.git', 'node_modules', 'dist', 'test-results', 'playwright-report', '.expo', 'android', 'ios']);
    cpSync(root, copy, { recursive: true, filter: file => {
      const relative = path.relative(root, file);
      return !relative || !excluded.has(relative.split(path.sep)[0]);
    } });
    symlinkSync(path.join(root, 'node_modules'), path.join(copy, 'node_modules'), 'dir');
    if (!fault.transport) {
      const filename = path.join(copy, fault.file || service);
      const source = readFileSync(filename, 'utf8');
      if (source.split(fault.anchor).length !== 2) throw new Error(`${fault.name}: mutation anchor is not unique`);
      writeFileSync(filename, source.replace(fault.anchor, fault.replacement ?? (fault.anchor + fault.code)));
    }
    const run = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', fault.test || 'smoke.spec.ts', ...(fault.grep ? ['--grep', fault.grep] : []), '--output', path.join(output, fault.name)], {
      cwd: copy, env: { ...process.env, JOURNEY_WITNESS: '', JOURNEY_FAULT: fault.transport ? fault.name : '' },
      encoding: 'utf8', timeout: 240_000,
    });
    const log = `${run.stdout || ''}\n${run.stderr || ''}`;
    writeFileSync(path.join(output, `${fault.name}.log`), log);
    if (run.status !== 1 || !log.includes(fault.expected) || !log.includes('1 failed')) {
      process.stderr.write(log);
      throw new Error(`${fault.name}: expected consumer assertion failure (${fault.expected}), got ${run.status}`);
    }
    results.push({ fault: fault.name, assertion: fault.expected, exit: run.status });
    console.log(`${fault.name}: detected at ${fault.expected} (exit 1)`);
  } finally { rmSync(copy, { recursive: true, force: true }); }
}
// Certify the unchanged source/export after all disposable mutations.
const baseline = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--output', path.join(output, 'restored-baseline')], {
  cwd: root, env: { ...process.env, JOURNEY_FAULT: '', JOURNEY_WITNESS: '' }, encoding: 'utf8', timeout: 240_000,
});
writeFileSync(path.join(output, 'restored-baseline.log'), `${baseline.stdout || ''}\n${baseline.stderr || ''}`);
if (baseline.status !== 0) throw new Error(`Unmodified baseline failed: ${baseline.status}`);
writeFileSync(path.join(output, group ? `${group.slice(2)}-proof-summary.json` : 'proof-summary.json'), JSON.stringify({ mutations: results, restoredBaselineExit: baseline.status }, null, 2));
console.log('Unmodified baseline passes after all mutations.');
