import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { startSyntheticWorkout } from './setup';
import { readPersistence } from './persistence';

test('production plan and completed set survive reopening', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Faults affect only this disposable test context, never the exported app.
  if (process.env.JOURNEY_FAULT === 'blocked-route') {
    await page.route('**/*.js', route => route.abort());
  } else if (process.env.JOURNEY_FAULT === 'memory-only') {
    await context.route('**/*.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replaceAll('strength-rebuild-v2.db', ':memory:');
      await route.fulfill({ response, body });
    });
  }
  await startSyntheticWorkout(page);
  await page.getByLabel('Carga de la serie 1', { exact: true }).fill('0');
  await page.getByLabel('Repeticiones de la serie 1', { exact: true }).fill('8');
  await page.getByLabel('Notas de la serie 1', { exact: true }).fill('Synthetic persistence smoke');
  await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click();
  await expect(page.getByText('COMPLETADA', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readPersistence(page, info)).sets, { message: 'Canonical completed-set values must persist' }).toEqual([
    { load: '0', reps: '8', notes: 'Synthetic persistence smoke', disposition: 'COMPLETED' },
  ]);
  const before = await readPersistence(page, info);
  expect(before.cycles.length).toBeGreaterThanOrEqual(4);
  expect(Number(before.weeks?.count)).toBeGreaterThan(0);
  expect(Number(before.sessions?.count)).toBe(Number(before.weeks?.count) * 3);
  expect(before.workouts).toHaveLength(1);
  expect(before.workouts[0]?.status).toBe('IN_PROGRESS');
  const draft = JSON.parse(String(before.workouts[0]?.actual_snapshot_json));
  expect(draft.exercises[0].sets[0]).toMatchObject({ completed: true, disposition: 'COMPLETED', reps: '8', notes: 'Synthetic persistence smoke' });
  await page.getByText('COMPLETADA', { exact: true }).scrollIntoViewIfNeeded();
  await info.attach('completed-set', { body: await page.screenshot({ path: info.outputPath('completed-set.png') }), contentType: 'image/png' });
  await page.close();
  const reopened = await context.newPage();
  reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto('/plan');
  await expect(reopened.getByText('Plan activo', { exact: true })).toBeVisible();
  await reopened.goto('/');
  await reopened.getByRole('button', { name: 'Continuar entrenamiento', exact: true }).click();
  // Production safety revalidation remains part of reopening.
  if (await reopened.getByLabel('Dolor de 0 a 2, estable', { exact: true }).isVisible()) {
    await reopened.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
    await reopened.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  }
  await expect(reopened.getByTestId('workout-screen')).toBeVisible();
  await expect(reopened.getByLabel('Carga de la serie 1', { exact: true })).toHaveValue('0');
  await expect(reopened.getByLabel('Repeticiones de la serie 1', { exact: true })).toHaveValue('8');
  await expect(reopened.getByLabel('Notas de la serie 1', { exact: true })).toHaveValue('Synthetic persistence smoke');
  await expect(reopened.getByText('COMPLETADA', { exact: true })).toBeVisible();
  const after = await readPersistence(reopened, info);
  expect(after.cycles).toEqual(before.cycles);
  expect(after.sets).toEqual(before.sets);
  expect(after.workouts.map(row => row.id)).toEqual(before.workouts.map(row => row.id));
  writeFileSync(info.outputPath('persistence-readback.json'), JSON.stringify({ before, after }, null, 2));
  await info.attach('persistence-readback', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
  await reopened.getByText('COMPLETADA', { exact: true }).scrollIntoViewIfNeeded();
  await info.attach('reopened-workout', { body: await reopened.screenshot({ path: info.outputPath('reopened-workout.png') }), contentType: 'image/png' });
  expect(errors).toEqual([]);
});
