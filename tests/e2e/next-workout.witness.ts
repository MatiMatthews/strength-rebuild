import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { startSyntheticWorkout } from './setup';
import { readPersistence } from './persistence';

// Deliberately outside the mandatory suite until next-session continuity is repaired.
// This asserts the desired behavior normally; no test.fail(), skip or inverted oracle.
test('finishing the first session permits preparing the next workout', async ({ page }, info) => {
  await startSyntheticWorkout(page);
  for (let exercise = 0; exercise < 40; exercise += 1) {
    const count = await page.getByTestId('set-entry-row').count();
    expect(count).toBeGreaterThan(0);
    for (let set = 1; set <= count; set += 1) {
      await page.getByLabel(`Carga de la serie ${set}`, { exact: true }).fill('0');
      await page.getByLabel(`Repeticiones de la serie ${set}`, { exact: true }).fill('8');
      await page.getByRole('button', { name: `Completar serie ${set}`, exact: true }).click();
    }
    const next = page.getByRole('button', { name: 'Siguiente ejercicio', exact: true });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await page.getByRole('button', { name: 'Revisar y terminar entrenamiento', exact: true }).click();
  await expect(page.getByTestId('finish-review')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar fin de entrenamiento', exact: true }).click();
  await expect(page.getByTestId('finish-review')).not.toBeVisible();
  await page.goto('/plan');
  await expect(page.getByText('Plan activo', { exact: true })).toBeVisible();
  const persisted = await readPersistence(page, info);
  expect(persisted.workouts).toHaveLength(1);
  expect(persisted.workouts[0]?.status).toBe('COMPLETED');
  const weeklyReviewVisible = await page.getByRole('button', { name: 'Crear propuesta semanal', exact: true }).isVisible();
  await page.screenshot({ path: info.outputPath('plan-after-completion.png'), fullPage: true });
  await page.goto('/');
  await expect(page.getByTestId('brand-masthead')).toBeVisible();
  const todayText = await page.locator('body').innerText();
  const evidence = { persisted, weeklyReviewVisible, todayText };
  writeFileSync(info.outputPath('next-workout-readback.json'), JSON.stringify(evidence, null, 2));
  await info.attach('next-workout-readback', { body: JSON.stringify(evidence), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('today-after-completion.png'), fullPage: true });
  await expect(page.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true }),
    'The next planned session must remain reachable after completing the first session').toBeVisible();
  await page.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true }).click();
  await page.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  await expect(page.getByTestId('workout-screen')).toBeVisible();
  const after = await readPersistence(page, info);
  expect(after.workouts).toHaveLength(2);
  expect(after.workouts.filter(row => row.status === 'IN_PROGRESS')).toHaveLength(1);
});
