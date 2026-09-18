import { fieldContrast } from './field-contrast';
import { navigationContrast } from './navigation-contrast';
import { test, expect } from '@playwright/test';
import { readPersistence } from './persistence';
import { startSyntheticWorkout } from './setup';

test('catalog constraints reject infeasible workouts and refresh preview and alternatives without rewriting an active workout', async ({ page, context }, info) => {
  await startSyntheticWorkout(page);
  await page.getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Movilidad torácica', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Press banca', exact: true })).toBeVisible();
  await expect.poll(async () => JSON.parse(String((await readPersistence(page, info)).workouts[0]!.actual_snapshot_json)).activeExerciseIndex).toBe(2);
  const original = await readPersistence(page, info);
  await page.goto('/settings');
  const save = page.getByRole('button', { name: 'Guardar configuración local', exact: true });
  await page.getByLabel('Alternar equipo Banco inclinado', { exact: true }).click();
  await save.click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const saved = await readPersistence(page, info);
  expect(saved.workouts).toEqual(original.workouts);
  expect(saved.sessionSnapshots).toEqual(original.sessionSnapshots);
  await page.goto('/workout');
  await expect(page.getByRole('heading', { name: 'Press banca', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reemplazar ejercicio', exact: true }).click();
  await page.getByRole('radio', { name: 'Equipo no disponible', exact: true }).click();
  for (const colorScheme of ['light', 'dark'] as const) { await page.emulateMedia({ colorScheme }); for (const radio of await page.getByRole('radio').all()) { if(!await radio.isVisible()) continue; await fieldContrast(radio, info, 'replacement-choice'); await navigationContrast(radio, info, 'replacement-label'); } }
  await expect(page.getByRole('button', { name: 'Elegir Press inclinado con mancuernas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await readPersistence(page, info)).toEqual(saved);
  await page.goto('/settings');
  await page.getByLabel('Usar solo peso corporal', { exact: true }).click();
  await page.getByRole('button', { name: 'Quitar requisito 3', exact: true }).click();
  await page.getByRole('button', { name: 'Quitar requisito 2', exact: true }).click();
  await page.getByLabel('Elegir Movilidad torácica para requisito 1', { exact: true }).click();
  await page.getByLabel('Alternar restricción Demanda abdominal baja', { exact: true }).click();
  await page.getByLabel('Alternar restricción Sin impacto', { exact: true }).click();
  await save.click();
  await expect(page.getByText(/no tiene ejercicios de trabajo compatibles/)).toBeVisible();
  expect(await readPersistence(page, info)).toEqual(saved);
  await page.getByLabel('Elegir Bird-dog para requisito 1', { exact: true }).click();
  await save.click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const valid = await readPersistence(page, info);
  expect(valid.workouts).toEqual(original.workouts);
  expect(valid.sessionSnapshots).toEqual(original.sessionSnapshots);
  const settings = JSON.parse(String(valid.settings.find(row => row.key === 'training-settings')!.value_json));
  expect(settings).toMatchObject({ equipment: ['bodyweight'], restrictions: ['abdominal', 'sin impacto'], requirements: [{ kind: 'EXACT', value: 'bird-dog' }] });
  await page.close();
  const reopened = await context.newPage(); await reopened.goto('/settings');
  await expect(reopened.getByText('Seleccionado: Bird-dog', { exact: true })).toBeVisible();
  expect(await readPersistence(reopened, info)).toEqual(valid);
});


test('catalog settings refresh the next preview on return and preserve existing prescriptions', async ({ page }, info) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const original = await readPersistence(page, info);
  await page.getByRole('button', { name: 'Abrir configuración del plan', exact: true }).click();
  await page.getByLabel('Usar solo peso corporal', { exact: true }).click();
  await page.getByRole('button', { name: 'Quitar requisito 3', exact: true }).click();
  await page.getByRole('button', { name: 'Quitar requisito 2', exact: true }).click();
  await page.getByLabel('Elegir Bird-dog para requisito 1', { exact: true }).click();
  await page.getByLabel('Alternar restricción Demanda abdominal baja', { exact: true }).click();
  await page.getByLabel('Alternar restricción Sin impacto', { exact: true }).click();
  await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  await page.getByRole('button', { name: 'Volver a Hoy', exact: true }).click();
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const preview = await readPersistence(page, info);
  expect(preview.workouts).toEqual(original.workouts);
  expect(preview.sessionSnapshots.filter(row => original.sessionSnapshots.some(old => old.id === row.id))).toEqual(original.sessionSnapshots);
  const fresh = preview.sessionSnapshots.filter(row => !original.sessionSnapshots.some(old => old.id === row.id));
  expect(fresh.length).toBeGreaterThan(0);
  for (const row of fresh) {
    const session = JSON.parse(String(row.snapshot_json)) as { exercises: { exerciseId: string }[] };
    expect(session.exercises.map(e => e.exerciseId)).toContain('bird-dog');
    expect(session.exercises.every(e => ['bird-dog', 'bodyweight-activation', 'thoracic-mobility', 'hip-mobility', 'shoulder-mobility'].includes(e.exerciseId))).toBe(true);
  }

});
