import { expect, test } from '@playwright/test';
import { changeCycleFixture } from './cycle-fixture';
import { readPersistence } from './persistence';

for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} progress filters real cycles and dated results, opens sets and retains effective corrections`, async ({ page, context }, info) => {
  test.setTimeout(180_000);
  await page.clock.setFixedTime(new Date('2026-09-20T12:00:00Z'));
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  let planned = 0;
  let strengthPlanned = 0;
  let app = await changeCycleFixture(page, context, info, db => {
    const scheduled = db.prepare("SELECT s.id,c.id AS cycle_id,c.kind FROM session_plan s JOIN training_week w ON w.id=s.training_week_id JOIN cycle c ON c.id=w.cycle_id WHERE c.kind IN ('strength','hypertrophy') ORDER BY c.kind,w.week_index,s.day_index").all();
    planned = scheduled.length;
    const strength = scheduled.filter(item => item.kind === 'strength');
    strengthPlanned = strength.length;
    const hypertrophy = scheduled.find(item => item.kind === 'hypertrophy')!;
    db.prepare("UPDATE cycle SET status='COMPLETED' WHERE id=?").run(strength[0]!.cycle_id!);
    db.prepare("UPDATE cycle SET status='ACTIVE' WHERE id=?").run(hypertrophy.cycle_id!);
    const set = { load: '20', reps: '5', rir: '3', technique: 'Limpia', pain: 0, notes: '', completed: true, skipped: false, disposition: 'COMPLETED' };
    for (const [index, session] of [strength[0]!, strength[1]!, hypertrophy].entries()) {
      const actual = { id: `progress-${index}`, sessionPlanId: session.id, safetyModifications: [], exercises: [
        { exerciseId: 'barbell-bench-press', originalExerciseId: 'barbell-bench-press', requirement: 'EXACT', sets: [{ ...set, load: ['200', '100', '120'][index] }, { ...set, completed: false, disposition: 'PENDING' }] },
        { exerciseId: 'chest-supported-row', originalExerciseId: 'chest-supported-row', requirement: 'PATTERN', sets: [{ ...set }] },
      ] };
      db.prepare("INSERT INTO workout_session (id,schema_version,created_at,updated_at,status,session_plan_id,prescribed_snapshot_json,actual_snapshot_json,completed_at) VALUES (?,1,'now','now','COMPLETED',?,'{\"dayIndex\":1,\"exercises\":[]}',?,?)").run(actual.id, session.id!, JSON.stringify(actual), ['2026-08-01T12:00:00Z','2026-09-10T12:00:00Z','2026-09-19T12:00:00Z'][index]!);
    }
  });
  await app.clock.setFixedTime(new Date('2026-09-20T12:00:00Z'));
  await app.emulateMedia({ colorScheme });
  await app.goto('/history');
  const original = (await readPersistence(app, info)).workouts;
  await expect(app.getByTestId('progress-metric-strip')).toContainText(`3 / ${planned}`);
  await expect(app.getByTestId('progress-metric-strip')).toContainText('6 series completadas de 9 registradas');
  await app.getByRole('button', { name: 'Ver resultado de Press banca', exact: true }).click();
  await expect(app.getByRole('button', { name: /225 kg/ })).toBeVisible();
  await app.getByRole('button', { name: /225 kg/ }).click();
  await expect(app.getByText('Serie 1: 200 kg × 5', { exact: true })).toBeVisible();
  await app.getByRole('button', { name: 'Corregir serie 1 de Press banca', exact: true }).click();
  await app.getByLabel('Carga corregida', { exact: true }).fill('210');
  await app.getByLabel('Motivo de la corrección', { exact: true }).fill('Synthetic plate correction');
  await app.getByRole('button', { name: 'Confirmar corrección del historial', exact: true }).click();
  await expect(app.getByText('Serie 1: 210 kg × 5', { exact: true })).toBeVisible();
  await app.getByRole('tab', { name: 'Resultados', exact: true }).click();
  await app.getByRole('button', { name: 'Ver resultado de Press banca', exact: true }).click();
  await expect(app.getByRole('button', { name: /236,3 kg/ })).toBeVisible();
  await app.getByRole('button', { name: 'Filtrar por ciclo', exact: true }).click();
  await app.getByRole('radio', { name: /^Fuerza \d+$/ }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.getByTestId('progress-metric-strip')).toContainText(`2 / ${strengthPlanned}`);
  await app.getByRole('button', { name: 'Filtrar por período', exact: true }).click();
  await app.getByRole('radio', { name: 'Últimos 30 días', exact: true }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await app.getByRole('button', { name: 'Filtrar por ejercicio', exact: true }).click();
  await app.getByRole('radio', { name: 'Press banca', exact: true }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.getByRole('button', { name: 'Ver resultado de Remo con pecho apoyado', exact: true })).toHaveCount(0);
  await expect(app.getByTestId('progress-metric-strip')).toContainText('Volumen registrado · 500 kg');
  await app.getByRole('button', { name: 'Ver resultado de Press banca', exact: true }).click();
  await expect(app.getByRole('button', { name: /112,5 kg/ })).toBeVisible();
  await expect(app.getByRole('button', { name: /236,3 kg/ })).toHaveCount(0);
  await app.getByRole('button', { name: /112,5 kg/ }).scrollIntoViewIfNeeded();
  await app.screenshot({ path: info.outputPath('filtered-dated-result.png'), fullPage: true });
  await app.getByRole('button', { name: /112,5 kg/ }).click();
  await expect(app.getByText('Serie 1: 100 kg × 5', { exact: true })).toBeVisible();
  await expect(app.getByText('Serie 1: 20 kg × 5', { exact: true })).toHaveCount(0);
  expect((await readPersistence(app, info)).workouts).toEqual(original);
  await app.goto('/settings');
  await app.getByRole('radio', { name: 'Usar lb', exact: true }).click();
  await app.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  await expect(app.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  await app.close();
  app = await context.newPage();
  await app.emulateMedia({ colorScheme });
  await app.goto('/history');
  await app.getByRole('button', { name: 'Ver resultado de Press banca', exact: true }).click();
  await expect(app.getByRole('button', { name: /521 lb/ })).toBeVisible();
  await app.getByRole('button', { name: /521 lb/ }).click();
  await expect(app.getByText(/Synthetic plate correction/)).toBeVisible();
  expect((await readPersistence(app, info)).workouts).toEqual(original);
  expect(await app.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await app.screenshot({ path: info.outputPath('effective-session-lb.png'), fullPage: true });
});
