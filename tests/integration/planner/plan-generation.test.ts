import { DatabaseSync } from 'node:sqlite';

import { ProgramService } from '../../../src/application/programs/program-service';
import { WeeklyReviewService } from '../../../src/application/progression/weekly-review';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';

function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = {
    exec: (sql) => sqlite.exec(sql),
    runAsync: async (sql: string, ...params: SqlValue[]) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never,
    withTransactionAsync: async (task) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as RepositoryDatabase & MigrationDatabase;
  return { db, close: () => sqlite.close() };
}

describe('plan generation SQLite seam', () => {
  it('repairs an unstarted prescription without rewriting originals and activates the effective plan', async () => {
    const opened = open(':memory:');
    try {
      await migrateDatabase(opened.db);
      const programs = new ProgramService(opened.db);
      await programs.createPlan([{ id: 'repair', type: 'strength', weeks: 1 }]);
      const id = 'repair-week-1-day-1';
      const row = await opened.db.getFirstAsync<{ snapshot_json: string }>('SELECT snapshot_json FROM session_plan WHERE id = ?', id);
      const session = JSON.parse(row!.snapshot_json);
      session.exercises[0].exerciseId = 'unknown';
      session.blocks[0].exercises[0].exerciseId = 'unknown';
      await opened.db.runAsync('UPDATE session_plan SET snapshot_json = ? WHERE id = ?', JSON.stringify(session), id);
      const originals = await opened.db.getAllAsync('SELECT * FROM session_plan');
      const proposal = await programs.prepareLegacyRepair(id, 'unknown', 'barbell-bench-press');
      await programs.applyLegacyRepair(proposal);
      await programs.applyLegacyRepair(proposal);
      expect(await opened.db.getAllAsync('SELECT * FROM session_plan')).toEqual(originals);
      expect(await programs.listInvalidSessionReferences()).toEqual([]);
      await programs.activateCycle('repair');
      const today = await programs.getToday();
      expect(today!.session.exercises[0]!.exerciseId).toBe('barbell-bench-press');
      expect(today!.session.exercises[0]!.calculatedLoad).toBeUndefined();
      expect(today!.cycle.weeks[0]!.sessions[0]).toEqual(today!.session);
      expect((await programs.listCycleSnapshots())[0]!.weeks[0]!.sessions[0]).toEqual(today!.session);
      expect(await opened.db.getAllAsync('SELECT * FROM decision_log')).toHaveLength(1);
    } finally { opened.close(); }
  });

  it('shows accepted persisted session targets in Plan exactly as Today reads them, without rewriting original snapshots', async () => {
    const opened = open(':memory:');
    try {
      await migrateDatabase(opened.db);
      const programs = new ProgramService(opened.db);
      const [original] = await programs.createPlan([{ id: 'reviewed', type: 'strength', weeks: 2, schedule: [2, 4, 6] }]);
      await programs.activateCycle('reviewed');
      await opened.db.runAsync("UPDATE training_week SET status = 'REVIEW' WHERE cycle_id = 'reviewed' AND week_index = 1");
      const reviews = new WeeklyReviewService(opened.db, () => '2026-09-05T10:00:00.000Z', () => 'synthetic-progression');
      const proposal = await reviews.propose({ cycleId: 'reviewed', weekIndex: 1, nextWeekIndex: 2, outcome: 'successful' });
      await opened.db.runAsync('UPDATE progression_proposal SET output_json = ? WHERE id = ?',
        JSON.stringify({ ...proposal, exerciseId: 'barbell-bench-press', nextTarget: { load: 45, reps: 5, sets: 4 } }), proposal.id);
      await reviews.decide(proposal.id, true);
      const tables = ['cycle', 'training_week', 'session_plan', 'workout_session', 'decision_log'];
      const before = await Promise.all(tables.map((table) => opened.db.getAllAsync(`SELECT * FROM ${table}`)));
      const today = await programs.getToday();
      const [displayed] = await programs.listCycleSnapshots();
      expect(today?.weekIndex).toBe(2);
      expect(today?.session.dayIndex).toBe(2);
      expect(today?.session.exercises.find((exercise) => exercise.exerciseId === 'barbell-bench-press'))
        .toMatchObject({ calculatedLoad: 45, target: { sets: 4, reps: { min: 5, max: 5 } } });
      expect(displayed!.weeks[1]!.sessions[0]).toEqual(today?.session);
      expect(displayed!.weeks[0]).toEqual(original!.weeks[0]);
      expect(await Promise.all(tables.map((table) => opened.db.getAllAsync(`SELECT * FROM ${table}`)))).toEqual(before);
      expect(JSON.parse((await opened.db.getFirstAsync<{ snapshot_json: string }>("SELECT snapshot_json FROM cycle WHERE id = 'reviewed'"))!.snapshot_json)).toEqual(original);
    } finally { opened.close(); }
  });

  it('rolls back the cycle status write when activation readback fails', async () => {
    const opened = open(':memory:');
    try {
      await migrateDatabase(opened.db);
      const programs = new ProgramService(opened.db);
      await programs.createPlan([{ id: 'current', type: 'strength', weeks: 1 }, { id: 'candidate', type: 'strength', weeks: 1 }]);
      await programs.activateCycle('current');
      const before = await opened.db.getAllAsync('SELECT * FROM cycle');
      const read = opened.db.getFirstAsync.bind(opened.db);
      const failingDb: RepositoryDatabase = { ...opened.db, getFirstAsync: async <T,>(sql: string, ...params: SqlValue[]) => {
        if (sql === "SELECT id FROM cycle WHERE status = 'ACTIVE' LIMIT 1") throw new Error('synthetic readback failure');
        return read<T>(sql, ...params);
      } };
      await expect(new ProgramService(failingDb).activateCycle('candidate')).rejects.toThrow('synthetic readback failure');
      expect(await opened.db.getAllAsync('SELECT * FROM cycle')).toEqual(before);
      expect(await programs.getActiveCycleId()).toBe('current');
    } finally { opened.close(); }
  });

  it.each(['bodyweight-activation', 'thoracic-mobility', 'hip-mobility'])('previews compatible %s without generating unrelated full workouts', async (replacementId) => {
    const opened = open(':memory:');
    try {
      await migrateDatabase(opened.db);
      const service = new ProgramService(opened.db);
      await service.createPlan([{ id: 'legacy-preview', type: 'strength', weeks: 1 }]);
      const id = 'legacy-preview-week-1-day-1';
      const row = await opened.db.getFirstAsync<{ snapshot_json: string }>('SELECT snapshot_json FROM session_plan WHERE id = ?', id);
      const session = JSON.parse(row!.snapshot_json);
      session.blocks[0].exercises[0].exerciseId = 'missing';
      await opened.db.runAsync('UPDATE session_plan SET snapshot_json = ? WHERE id = ?', JSON.stringify(session), id);
      const tables = ['cycle', 'training_week', 'session_plan', 'workout_session'];
      const before = await Promise.all(tables.map((table) => opened.db.getAllAsync(`SELECT * FROM ${table}`)));
      await expect(service.previewLegacyReplacement(id, 'missing', replacementId, { equipment: ['bodyweight'], restrictions: ['abdominal'] }))
        .resolves.toMatchObject({ exerciseId: replacementId, requirement: 'EXACT', braceDemand: 'low', lumbarDemand: 'low',
          target: { sets: 3, reps: { min: 3, max: 6 } } });
      expect(await Promise.all(tables.map((table) => opened.db.getAllAsync(`SELECT * FROM ${table}`)))).toEqual(before);
    } finally { opened.close(); }
  });

  it('does not offer repairs for planned rows inside a completed cycle', async () => {
    const first = open(':memory:');
    await migrateDatabase(first.db);
    const service = new ProgramService(first.db);
    await service.createPlan([{ id: 'closed', type: 'strength', weeks: 1 }]);
    const id = 'closed-week-1-day-1';
    const row = await first.db.getFirstAsync<{ snapshot_json: string }>('SELECT snapshot_json FROM session_plan WHERE id = ?', id);
    const snapshot = JSON.parse(row!.snapshot_json);
    snapshot.exercises[0].exerciseId = 'missing';
    await first.db.runAsync('UPDATE session_plan SET snapshot_json = ? WHERE id = ?', JSON.stringify(snapshot), id);
    expect((await service.listInvalidSessionReferences())[0]?.unstarted).toBe(true);
    await first.db.runAsync("UPDATE cycle SET status = 'COMPLETED' WHERE id = 'closed'");
    const before = await first.db.getAllAsync('SELECT * FROM session_plan');
    expect((await service.listInvalidSessionReferences())[0]?.unstarted).toBe(false);
    await expect(service.previewLegacyReplacement(id, 'missing', 'bird-dog', { equipment: ['bodyweight'], restrictions: [] })).rejects.toThrow('cerrada');
    expect(await first.db.getAllAsync('SELECT * FROM session_plan')).toEqual(before);
    first.close();
  });

  it('inventories invalid stored sessions without changing unstarted or recorded work after reopen', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-legacy-inventory-${process.pid}-${Date.now()}.sqlite`;
    const first = open(path);
    await migrateDatabase(first.db);
    const service = new ProgramService(first.db);
    await service.createPlan([{ id: 'legacy', type: 'strength', weeks: 1 }, { id: 'valid', type: 'strength', weeks: 1 }]);
    for (const day of [1, 2, 3]) {
      const id = `legacy-week-1-day-${day}`;
      const row = await first.db.getFirstAsync<{ snapshot_json: string }>('SELECT snapshot_json FROM session_plan WHERE id = ?', id);
      const snapshot = JSON.parse(row!.snapshot_json);
      snapshot.exercises[0].exerciseId = 'missing-flat';
      snapshot.blocks[0].exercises[0].exerciseId = 'missing-block';
      await first.db.runAsync('UPDATE session_plan SET snapshot_json = ? WHERE id = ?', JSON.stringify(snapshot), id);
    }
    await first.db.runAsync("UPDATE session_plan SET status = 'COMPLETED' WHERE id = 'legacy-week-1-day-2'");
    await first.db.runAsync(`INSERT INTO workout_session (id, schema_version, created_at, updated_at, session_plan_id, status, prescribed_snapshot_json, actual_snapshot_json)
      VALUES ('recorded', 1, 'now', 'now', 'legacy-week-1-day-3', 'IN_PROGRESS', '{}', '{"load":80}')`);
    const tables = ['cycle', 'training_week', 'session_plan', 'workout_session'];
    const before = await Promise.all(tables.map((table) => first.db.getAllAsync(`SELECT * FROM ${table}`)));
    const expected = [1, 2, 3].map((day) => ({ cycleId: 'legacy', sessionPlanId: `legacy-week-1-day-${day}`, weekIndex: 1, dayIndex: day,
      invalidExerciseIds: ['missing-flat', 'missing-block'], unstarted: day === 1 }));
    const preview = await service.previewLegacyReplacement('legacy-week-1-day-1', 'missing-flat', 'barbell-bench-press', { equipment: ['barbell', 'bench'], restrictions: [] });
    expect(preview.exerciseId).toBe('barbell-bench-press');
    expect(preview.target.reps).toEqual({ min: 3, max: 6 });
    expect(preview.calculatedLoad).toBeUndefined();
    await expect(service.previewLegacyReplacement('legacy-week-1-day-1', 'missing-flat', 'barbell-bench-press', { equipment: ['bodyweight'], restrictions: [] })).rejects.toThrow('compatible');
    await expect(service.previewLegacyReplacement('legacy-week-1-day-1', 'missing-flat', 'low-volume-jump', { equipment: ['bodyweight'], restrictions: ['sin impacto'] })).rejects.toThrow('compatible');
    await expect(service.previewLegacyReplacement('legacy-week-1-day-2', 'missing-flat', 'bird-dog', { equipment: ['bodyweight'], restrictions: [] })).rejects.toThrow('iniciada');
    await expect(service.previewLegacyReplacement('legacy-week-1-day-3', 'missing-flat', 'bird-dog', { equipment: ['bodyweight'], restrictions: [] })).rejects.toThrow('iniciada');
    await expect(service.previewLegacyReplacement('legacy-week-1-day-1', 'real-id', 'bird-dog', { equipment: ['bodyweight'], restrictions: [] })).rejects.toThrow('referencia');
    expect(await service.listInvalidSessionReferences()).toEqual(expected.map(reference => ({ ...reference, repairable: reference.unstarted })));
    expect(await service.listInvalidSessionReferences()).toEqual(expected.map(reference => ({ ...reference, repairable: reference.unstarted })));
    expect(await Promise.all(tables.map((table) => first.db.getAllAsync(`SELECT * FROM ${table}`)))).toEqual(before);
    first.close();
    const reopened = open(path);
    expect(await new ProgramService(reopened.db).listInvalidSessionReferences()).toEqual(expected.map(reference => ({ ...reference, repairable: reference.unstarted })));
    expect(await Promise.all(tables.map((table) => reopened.db.getAllAsync(`SELECT * FROM ${table}`)))).toEqual(before);
    reopened.close();
  });

  it('rejects warmup-only workouts without any partial writes or active-plan changes after reopen', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-empty-work-${process.pid}-${Date.now()}.sqlite`;
    const first = open(path);
    await migrateDatabase(first.db);
    const service = new ProgramService(first.db);
    await service.createPlan([{ id: 'current', type: 'strength', weeks: 1 }]);
    await service.activateCycle('current');
    const tables = ['program_template', 'cycle', 'session_plan'];
    const before = await Promise.all(tables.map((table) => first.db.getAllAsync(`SELECT * FROM ${table}`)));
    await expect(service.createPlan([
      { id: 'valid-first', type: 'strength', weeks: 1 },
      { id: 'empty-work', type: 'strength', weeks: 1, equipment: ['bodyweight'], restrictions: ['abdominal'] },
    ])).rejects.toThrow('día 1');
    expect(await Promise.all(tables.map((table) => first.db.getAllAsync(`SELECT * FROM ${table}`)))).toEqual(before);
    first.close();
    const reopened = open(path);
    expect(await Promise.all(tables.map((table) => reopened.db.getAllAsync(`SELECT * FROM ${table}`)))).toEqual(before);
    expect(await new ProgramService(reopened.db).getActiveCycleId()).toBe('current');
    reopened.close();
  });

  it('persists only available low-brace defaults through activation and reopen', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-compatible-${process.pid}-${Date.now()}.sqlite`;
    const first = open(path);
    await migrateDatabase(first.db);
    await new ProgramService(first.db).createPlan([{ id: 'compatible', type: 'strength', weeks: 1,
      equipment: ['bodyweight'], restrictions: ['abdominal'], requirements: [{ kind: 'EXACT', value: 'bird-dog' }] }]);
    await new ProgramService(first.db).activateCycle('compatible');
    first.close();
    const reopened = open(path);
    const cycle = await reopened.db.getFirstAsync<{ snapshot_json: string; status: string }>("SELECT snapshot_json, status FROM cycle WHERE id = 'compatible'");
    expect(cycle!.status).toBe('ACTIVE');
    const sessions = await reopened.db.getAllAsync<{ snapshot_json: string }>('SELECT snapshot_json FROM session_plan ORDER BY id');
    const expected = [
      ['bodyweight-activation', 'thoracic-mobility', 'bird-dog'],
      ['bodyweight-activation', 'hip-mobility', 'bird-dog'],
      ['bodyweight-activation', 'shoulder-mobility', 'bird-dog', 'bird-dog'],
    ];
    for (const workouts of [JSON.parse(cycle!.snapshot_json).weeks[0].sessions, sessions.map((row) => JSON.parse(row.snapshot_json))]) {
      expect(workouts.map((workout: { exercises: { exerciseId: string }[] }) => workout.exercises.map((exercise) => exercise.exerciseId))).toEqual(expected);
    }
    reopened.close();
  });

  it('preserves default squat safety demand in cycle and session snapshots after activation and reopen', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-demands-${process.pid}-${Date.now()}.sqlite`;
    const first = open(path);
    await migrateDatabase(first.db);
    const service = new ProgramService(first.db);
    await service.createPlan([{ id: 'demands', type: 'strength', weeks: 1 }]);
    await service.activateCycle('demands');
    first.close();
    const reopened = open(path);
    const cycle = await reopened.db.getFirstAsync<{ snapshot_json: string }>("SELECT snapshot_json FROM cycle WHERE id = 'demands'");
    const session = await reopened.db.getFirstAsync<{ snapshot_json: string }>("SELECT snapshot_json FROM session_plan WHERE id = 'demands-week-1-day-2'");
    for (const workout of [JSON.parse(cycle!.snapshot_json).weeks[0].sessions[1], JSON.parse(session!.snapshot_json)]) {
      const squat = workout.exercises.find((exercise: { exerciseId: string }) => exercise.exerciseId === 'smith-box-squat');
      expect(squat).toMatchObject({ braceDemand: 'high', lumbarDemand: 'moderate' });
    }
    reopened.close();
  });

  it.each(['missing', 'completed', 'cycle-catalog', 'session-catalog'])(
    'rejects %s activation without changing persisted cycles, including after reopen', async (fault) => {
      const path = `${process.env.TMPDIR ?? '/tmp'}/strength-activation-${fault}-${process.pid}-${Date.now()}.sqlite`;
      const first = open(path);
      await migrateDatabase(first.db);
      const service = new ProgramService(first.db);
      await service.createPlan([{ id: 'current', type: 'strength', weeks: 1 }, { id: 'candidate', type: 'strength', weeks: 1 }]);
      await service.activateCycle('current');
      if (fault === 'completed') await first.db.runAsync("UPDATE cycle SET status = 'COMPLETED' WHERE id = 'candidate'");
      if (fault === 'cycle-catalog') {
        const snapshots = await service.listCycleSnapshots();
        const candidate = JSON.parse(JSON.stringify(snapshots[1]));
        candidate.weeks[0].sessions[0].blocks[0].exercises[0].exerciseId = 'invented-exercise';
        await first.db.runAsync("UPDATE cycle SET snapshot_json = ? WHERE id = 'candidate'", JSON.stringify(candidate));
      }
      if (fault === 'session-catalog') {
        const row = await first.db.getFirstAsync<{ snapshot_json: string }>("SELECT snapshot_json FROM session_plan WHERE id = 'candidate-week-1-day-1'");
        const session = JSON.parse(row!.snapshot_json);
        session.exercises[0].exerciseId = 'invented-exercise';
        await first.db.runAsync("UPDATE session_plan SET snapshot_json = ? WHERE id = 'candidate-week-1-day-1'", JSON.stringify(session));
      }
      const before = await first.db.getAllAsync('SELECT * FROM cycle');
      await expect(service.activateCycle(fault === 'missing' ? 'missing' : 'candidate')).rejects.toThrow();
      expect(await first.db.getAllAsync('SELECT * FROM cycle')).toEqual(before);
      first.close();
      const reopened = open(path);
      expect(await reopened.db.getAllAsync('SELECT * FROM cycle')).toEqual(before);
      expect(await new ProgramService(reopened.db).getActiveCycleId()).toBe('current');
      reopened.close();
    },
  );

  it('persists resolved requirement IDs and rejects an unsatisfied request without changing the active plan', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-catalog-${process.pid}-${Date.now()}.sqlite`;
    const first = open(path);
    await migrateDatabase(first.db);
    const service = new ProgramService(first.db);
    await service.createPlan([{ id: 'catalog', type: 'strength', weeks: 1,
      requirements: [{ kind: 'PATTERN', value: 'horizontal-push' }, { kind: 'CAPABILITY', value: 'power' }] }]);
    await service.activateCycle('catalog');
    const before = await first.db.getAllAsync('SELECT * FROM cycle');
    await expect(service.createPlan([{ id: 'invalid', type: 'strength', weeks: 1,
      equipment: ['bodyweight'], requirements: [{ kind: 'EXACT', value: 'barbell-bench-press' }] }])).rejects.toThrow('Requisito 1');
    expect(await first.db.getAllAsync('SELECT * FROM cycle')).toEqual(before);
    expect(await first.db.getFirstAsync('SELECT COUNT(*) AS count FROM program_template')).toEqual({ count: 1 });
    first.close();
    const reopened = open(path);
    const row = await reopened.db.getFirstAsync<{ snapshot_json: string; status: string }>('SELECT snapshot_json, status FROM cycle WHERE id = ?', 'catalog');
    expect(row?.status).toBe('ACTIVE');
    const snapshot = JSON.parse(row!.snapshot_json);
    const requested = snapshot.weeks[0].sessions[0].blocks.find((block: { role: string }) => block.role === 'core').exercises.slice(-2);
    expect(requested.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual(['barbell-bench-press', 'low-volume-jump']);
    expect(requested[0].target).toEqual({ sets: 3, reps: { min: 3, max: 6 }, rir: { min: 2, max: 3 }, loadPercent: { min: 75, max: 85 } });
    reopened.close();
  });

  it('persists hypertrophy, transition, and strength snapshots and restores identical Today data', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-plan-${process.pid}-${Date.now()}.sqlite`;
    const first = open(path);
    await migrateDatabase(first.db);
    const service = new ProgramService(first.db, () => '2026-08-17T12:00:00.000Z');

    await service.createPlan([
      { id: 'hypertrophy-1', type: 'hypertrophy', weeks: 1 },
      { id: 'strength-1', type: 'strength', weeks: 1 },
    ]);

    expect(await service.listCycleSnapshots()).toHaveLength(3);
    expect((await service.listCycleSnapshots()).map(({ type }) => type)).toEqual([
      'hypertrophy', 'transition', 'strength',
    ]);
    expect(await service.countSessionSnapshots()).toBe(9);
    expect(await first.db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM cycle WHERE status = 'ACTIVE'")).toEqual({ count: 0 });
    expect(await service.getToday()).toBeNull();
    await service.activateCycle('hypertrophy-1');
    expect(await first.db.getFirstAsync<{ id: string }>("SELECT id FROM cycle WHERE status = 'ACTIVE'")).toEqual({ id: 'hypertrophy-1' });
    const todayBeforeClose = await service.getToday();
    expect(await service.getTodayContext()).toEqual({
      activeSession: false,
      restrictionActive: false,
      reviewRequired: false,
      today: todayBeforeClose,
    });
    first.close();

    const reopened = open(path);
    await migrateDatabase(reopened.db);
    const restored = new ProgramService(reopened.db);
    expect(await restored.getToday()).toEqual(todayBeforeClose);
    expect(await restored.countSessionSnapshots()).toBe(9);
    reopened.close();
  });

  it('keeps repeated preview creation idempotent and Today scoped to the confirmed active cycle', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-plan-repeat-${process.pid}-${Date.now()}.sqlite`;
    const opened = open(path);
    await migrateDatabase(opened.db);
    const service = new ProgramService(opened.db, () => '2026-08-18T12:00:00.000Z');
    const requests = [
      { id: 'preview-reentry', type: 'reentry' as const, weeks: 1 },
      { id: 'confirmed-strength', type: 'strength' as const, weeks: 1 },
    ];

    await service.createPlan(requests);
    await expect(service.createPlan(requests)).resolves.toHaveLength(2);
    expect(await opened.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM program_template')).toEqual({ count: 1 });
    expect(await opened.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM cycle')).toEqual({ count: 2 });
    expect(await service.getToday()).toBeNull();

    await service.activateCycle('confirmed-strength');
    expect((await service.getToday())?.cycleId).toBe('confirmed-strength');
    opened.close();
  });
});
