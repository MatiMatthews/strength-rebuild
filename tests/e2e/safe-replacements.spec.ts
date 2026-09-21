import { expect, test, type Page } from '@playwright/test';
import { startSyntheticWorkout, openBenchPress, openSetNotes } from './setup';
import { readPersistence } from './persistence';

async function enableIncline(page: Page) {
  await page.goto('/settings');
  await page.getByLabel('Alternar equipo Banco inclinado', { exact: true }).click();
  await page.getByLabel('Nivel técnico Intermedio', { exact: true }).click();
  await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  await page.goto('/workout');
}

async function selectIncline(page: Page) {
  await page.getByRole('button', { name: 'Reemplazar ejercicio', exact: true }).click();
  await page.getByRole('radio', { name: 'Equipo no disponible', exact: true }).click();
  await page.getByRole('button', { name: 'Elegir Press inclinado con mancuernas', exact: true }).click();
}

test('confirmed replacement has independent targets and exact attribution after reopen and finish', async ({ page, context }, info) => {
  await startSyntheticWorkout(page);
  await openBenchPress(page);
  await page.getByLabel('Carga de la serie 1', { exact: true }).fill('60');
  await page.getByLabel('Repeticiones de la serie 1', { exact: true }).fill('9');
  await (await openSetNotes(page, 1)).fill('Pending bench draft');
  await enableIncline(page);
  const before = await readPersistence(page, info);
  const original = JSON.parse(String(before.workouts[0]!.actual_snapshot_json));
  const index = original.activeExerciseIndex;
  await selectIncline(page);
  await expect(page.getByText('Carga por definir, sin copiar la anterior.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await readPersistence(page, info)).toEqual(before);
  await selectIncline(page);
  await page.getByRole('button', { name: 'Confirmar reemplazo', exact: true }).click();
  await expect(page.getByTestId('workout-exercise-header')).toContainText('Press inclinado con mancuernas');
  await expect(page.getByLabel('Carga de la serie 1', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Repeticiones de la serie 1', { exact: true })).toHaveValue('8');
  const replaced = await readPersistence(page, info);
  const actual = JSON.parse(String(replaced.workouts[0]!.actual_snapshot_json));
  expect(actual.exercises[index]).toMatchObject({ exerciseId: 'incline-dumbbell-press', originalExerciseId: 'barbell-bench-press' });
  expect(actual.exercises[index].sets.every((set: { load: string; notes: string; disposition: string }) => set.load === '' && set.notes === '' && set.disposition === 'PENDING')).toBe(true);
  expect(replaced.sessionSnapshots).toEqual(before.sessionSnapshots);
  expect(replaced.workouts[0]!.prescribed_snapshot_json).toBe(before.workouts[0]!.prescribed_snapshot_json);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/workout');
  await expect(reopened.getByTestId('workout-exercise-header')).toContainText('Press inclinado con mancuernas');
  await expect(reopened.getByLabel('Carga de la serie 1', { exact: true })).toHaveValue('');
  await reopened.getByLabel('Carga de la serie 1', { exact: true }).fill('20');
  await reopened.getByLabel('Repeticiones de la serie 1', { exact: true }).fill('10');
  await reopened.getByRole('button', { name: 'Completar serie 1', exact: true }).click();
  await reopened.getByRole('button', { name: 'Reemplazar ejercicio', exact: true }).click();
  await expect(reopened.getByText(/ya hay trabajo registrado/)).toBeVisible();
  await reopened.getByRole('radio', { name: 'Quiero variar', exact: true }).click();
  await expect(reopened.getByText('No hay alternativas compatibles', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await reopened.getByRole('button', { name: 'Revisar y terminar entrenamiento', exact: true }).click();
  await reopened.getByRole('button', { name: 'Confirmar fin de entrenamiento', exact: true }).click();
  await expect.poll(async () => (await readPersistence(reopened, info)).workouts[0]!.status).toBe('COMPLETED');
  await reopened.reload();
  const finished = await readPersistence(reopened, info);
  const final = JSON.parse(String(finished.workouts[0]!.actual_snapshot_json));
  expect(finished.workouts[0]!.status).toBe('COMPLETED');
  expect(final.exercises[index]).toMatchObject({ exerciseId: 'incline-dumbbell-press', originalExerciseId: 'barbell-bench-press', sets: [expect.objectContaining({ load: '20', reps: '10', disposition: 'COMPLETED' }), expect.anything()] });
  expect(finished.workouts[0]!.prescribed_snapshot_json).toBe(before.workouts[0]!.prescribed_snapshot_json);
});

test('partially and fully completed exercises cannot transfer records to an alternative', async ({ page, context }, info) => {
  await startSyntheticWorkout(page);
  await openBenchPress(page);
  await enableIncline(page);
  for (const set of [1, 2]) {
    await page.getByLabel(`Carga de la serie ${set}`, { exact: true }).fill('60');
    await page.getByLabel(`Repeticiones de la serie ${set}`, { exact: true }).fill('8');
    await page.getByRole('button', { name: `Completar serie ${set}`, exact: true }).click();
    const before = await readPersistence(page, info);
    await selectIncline(page);
    await expect(page.getByText(/ya hay trabajo registrado/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar reemplazo', exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`preserved-${set}-completed.png`), fullPage: true });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(await readPersistence(page, info)).toEqual(before);
  }
  const before = await readPersistence(page, info);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/workout');
  await expect(reopened.getByTestId('workout-exercise-header')).toContainText('Press banca');
  const restored = await readPersistence(reopened, info);
  expect(restored.workouts[0]!.actual_snapshot_json).toBe(before.workouts[0]!.actual_snapshot_json);
  await reopened.getByRole('button', { name: 'Revisar y terminar entrenamiento', exact: true }).click();
  await reopened.getByRole('button', { name: 'Confirmar fin de entrenamiento', exact: true }).click();
  await expect.poll(async () => (await readPersistence(reopened, info)).workouts[0]!.status).toBe('COMPLETED');
  await reopened.goto('/history');
  const history = await readPersistence(reopened, info);
  const saved = JSON.parse(String(history.workouts[0]!.actual_snapshot_json));
  const completed = saved.exercises.filter((exercise: { sets: { disposition: string }[] }) => exercise.sets.some(set => set.disposition === 'COMPLETED'));
  expect(completed).toHaveLength(1);
  expect(completed[0].exerciseId).toBe('barbell-bench-press');
  expect(completed[0].sets.map((set: { load: string }) => set.load)).toEqual(['60', '60']);
});
