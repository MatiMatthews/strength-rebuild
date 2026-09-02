import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

import type { RepositoryDatabase } from '../../data/repositories';
import { LegacyPayloadError, parseLegacyPayload, type LegacyImportPayloadV1 } from './legacy-payload';
import { readLegacyState, type LegacyNativeReadResult } from './legacy-state-reader';

interface ImportOptions {
  readonly readLegacyState?: () => LegacyNativeReadResult;
  readonly digest?: (payload: string) => Promise<string>;
  readonly now?: () => string;
}

export type LegacyImportResult =
  | { readonly status: 'absent' | 'oversized' }
  | { readonly status: 'imported' | 'already-imported'; readonly digest: string }
  | { readonly status: 'invalid'; readonly error: LegacyPayloadError };

interface JournalRow { payload_digest: string }

async function sha256(payload: string) {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, payload);
}

/** Imports V1 state transactionally while leaving the native source untouched for recovery. */
export async function importLegacyState(
  db: RepositoryDatabase,
  options: ImportOptions = {},
): Promise<LegacyImportResult> {
  const nativeResult = (options.readLegacyState ?? readLegacyState)();
  if (nativeResult.status !== 'available') return { status: nativeResult.status };

  let payload: LegacyImportPayloadV1;
  try {
    payload = parseLegacyPayload(nativeResult.payload);
  } catch (error) {
    if (error instanceof LegacyPayloadError) return { status: 'invalid', error };
    throw error;
  }

  const digest = await (options.digest ?? sha256)(nativeResult.payload);
  const existing = await db.getFirstAsync<JournalRow>(
    'SELECT payload_digest FROM legacy_import_journal WHERE payload_digest = ?',
    digest,
  );
  if (existing) return { status: 'already-imported', digest };

  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  const workoutId = `legacy-v1-workout-${digest}`;
  const exercises = Object.entries(payload.checks).map(([exerciseId, completed]) => ({
    exerciseId,
    originalExerciseId: exerciseId,
    requirement: 'CAPABILITY' as const,
    sets: [{
      load: '', reps: completed ? '1' : '0', rir: '', technique: 'Limpia' as const,
      pain: 0, notes: payload.notes[payload.view] ?? '', completed, skipped: !completed,
      disposition: completed ? 'COMPLETED' as const : 'SKIPPED' as const,
      ...(completed ? {} : { skipReason: 'No completado en V1' }),
    }],
  }));
  const prescribedSnapshot = {
    id: `legacy-v1-${payload.view}`,
    title: `Sesión V1 · ${payload.stage}`,
    exercises: exercises.map(({ exerciseId }) => ({
      exerciseId, requirement: 'CAPABILITY', target: { sets: 1, reps: { min: 1, max: 1 }, rir: { min: 0, max: 0 } },
    })),
  };
  const actualSnapshot = { id: workoutId, activeExerciseIndex: Math.max(0, exercises.length - 1), exercises, safetyModifications: [], timer: { remainingSeconds: payload.timerDurationSeconds, runningSince: null } };
  let imported = false;
  await db.withTransactionAsync(async () => {
    const raced = await db.getFirstAsync<JournalRow>(
      'SELECT payload_digest FROM legacy_import_journal WHERE payload_digest = ?',
      digest,
    );
    if (raced) return;

    await db.runAsync(
      `INSERT INTO workout_session
       (id, schema_version, created_at, updated_at, status, prescribed_snapshot_json, actual_snapshot_json, completed_at)
       VALUES (?, 1, ?, ?, 'COMPLETED', ?, ?, ?)`,
      workoutId, timestamp, timestamp, JSON.stringify(prescribedSnapshot), JSON.stringify(actualSnapshot), timestamp,
    );
    for (const [index, exercise] of exercises.entries()) {
      const set = exercise.sets[0]!;
      await db.runAsync(
        `INSERT INTO set_log
         (id, schema_version, created_at, updated_at, workout_session_id, set_index, reps, pain, notes)
         VALUES (?, 1, ?, ?, ?, 1, ?, 0, ?)`,
        `${workoutId}-set-${index + 1}`, timestamp, timestamp, workoutId, Number(set.reps), set.notes,
      );
    }
    for (const [key, severity] of Object.entries(payload.pain)) {
      await db.runAsync(
        `INSERT INTO symptom_log
         (id, schema_version, created_at, updated_at, workout_session_id, symptom, severity, context_json)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
        `${workoutId}-symptom-${key}`, timestamp, timestamp, workoutId, key, severity,
        JSON.stringify({ source: 'v1', stage: payload.stage, view: payload.view }),
      );
    }
    for (const [key, body] of Object.entries(payload.notes)) {
      await db.runAsync(
        `INSERT INTO session_note
         (id, schema_version, created_at, updated_at, workout_session_id, body)
         VALUES (?, 1, ?, ?, ?, ?)`,
        `${workoutId}-note-${key}`, timestamp, timestamp, workoutId, body,
      );
    }
    await db.runAsync(
      `INSERT INTO timer_state
       (id, schema_version, created_at, updated_at, workout_session_id, duration_seconds, state)
       VALUES (?, 1, ?, ?, ?, ?, 'PAUSED')`,
      `${workoutId}-timer`, timestamp, timestamp, workoutId, payload.timerDurationSeconds,
    );

    await db.runAsync(
      `INSERT INTO app_setting (id, schema_version, created_at, updated_at, key, value_json)
       VALUES (?, 1, ?, ?, ?, ?)
       ON CONFLICT(key) DO NOTHING`,
      'legacy-v1-state', timestamp, timestamp, 'legacy.v1.state', JSON.stringify(payload),
    );
    await db.runAsync(
      `INSERT INTO legacy_import_journal
       (id, schema_version, created_at, updated_at, source_version, payload_digest, status, details_json)
       VALUES (?, 1, ?, ?, '1', ?, 'IMPORTED', ?)`,
      `legacy-v1-${digest}`, timestamp, timestamp, digest,
      JSON.stringify({ settingKey: 'legacy.v1.state', workoutId, typedRecords: { sets: exercises.length, symptoms: Object.keys(payload.pain).length, notes: Object.keys(payload.notes).length } }),
    );
    imported = true;
  });

  return { status: imported ? 'imported' : 'already-imported', digest };
}
