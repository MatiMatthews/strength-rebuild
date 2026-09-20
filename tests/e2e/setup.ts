import { expect, type Page } from '@playwright/test';

export async function startSyntheticWorkout(page: Page, inspectPreparation?: () => Promise<void>) {
  await page.goto('/plan');
  await expect(page.getByTestId('plan-screen')).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByText('Todavía no hay ciclos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  await page.getByRole('button', { name: /Semana 1 de Reentrada/ }).click();
  await expect(page.getByText('Activación general', { exact: true })).toHaveCount(3);
  await expect(page.getByText('2 series · 5–10 repeticiones · RIR 4–5', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Carga por definir', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Semana 1 de Reentrada/ }).click();
  await page.getByRole('button', { name: 'Activar plan confirmado', exact: true }).click();
  await expect(page.getByText('Plan activo', { exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true }).click();
  await inspectPreparation?.();
  await page.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  await expect(page.getByTestId('workout-screen')).toBeVisible();
  await expect(page.getByTestId('readiness-focused-surface')).toHaveCount(0);
}

// A disabled Next command can mean a save is in progress. The production
// progress rail, not transient button availability, identifies the final item.
export async function isLastWorkoutExercise(page: Page) {
  const rail = page.getByTestId('workout-sequence-rail');
  const current = Number(await rail.getAttribute('aria-valuenow'));
  const total = Number(await rail.getAttribute('aria-valuemax'));
  expect(current).toBeGreaterThan(0);
  expect(total).toBeGreaterThanOrEqual(current);
  return current === total;
}

export async function fillSetQuantity(page: Page, set: number, reps = '8', load = '0') {
  const seconds = page.getByLabel(`Segundos de la serie ${set}`, { exact: true });
  if (await seconds.count()) await seconds.fill(reps);
  else {
    const weight = page.getByLabel(`Carga de la serie ${set}`, { exact: true });
    if (await weight.count()) await weight.fill(load);
    await page.getByLabel(`Repeticiones de la serie ${set}`, { exact: true }).fill(reps);
  }
}

export async function openSetNotes(page: Page, set: number) {
  await page.getByRole('button', { name: `Editar serie ${set}`, exact: true }).click();
  const notes = page.getByLabel(`Notas de la serie ${set}`, { exact: true });
  if (!await notes.count()) await page.getByRole('button', { name: `Mostrar notas de la serie ${set}`, exact: true }).click();
  return notes;
}

export async function openBenchPress(page: Page) {
  for (let index = 0; index < 20; index += 1) {
    if (await page.getByTestId('workout-exercise-header').getByRole('button', { name: 'Ver instrucciones y guía del ejercicio Press banca', exact: true }).count()) return;
    const current = Number(await page.getByTestId('workout-sequence-rail').getAttribute('aria-valuenow'));
    await page.getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click();
    await expect(page.getByTestId('workout-sequence-rail')).toHaveAttribute('aria-valuenow', String(current + 1));
  }
  throw new Error('The synthetic plan has no bench press');
}
