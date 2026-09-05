import { test, expect } from '@playwright/test';
import { startSyntheticWorkout } from './setup';
import { readPersistence } from './persistence';

test('requirement fields reject invalid drafts without changing saved settings or an active plan', async ({ page, context }, info) => {
  await startSyntheticWorkout(page);
  await page.goto('/settings');
  const save = page.getByRole('button', { name: 'Guardar configuración local', exact: true });
  await save.click();
  await expect(page.getByText('Configuración guardada en este dispositivo.', { exact: true })).toBeVisible();
  const before = await readPersistence(page, info);
  const cases = [
    { kind: 'EXACT', value: 'barbell-bench-press', choice: 'Press banca' },
    { kind: 'PATTERN', value: 'horizontal-push', choice: 'horizontal-push' },
    { kind: 'CAPABILITY', value: 'power', choice: 'power' },
  ];
  for (const [index, requirement] of cases.entries()) {
    const field = page.getByLabel(`Requisito ${requirement.kind}`, { exact: true });
    for (const invalid of ['missing-catalog-option', '']) {
      await field.fill(invalid);
      await save.click();
      await expect(page.getByRole('alert').filter({ hasText: `Requisito ${index + 1} (` }), 'Invalid requirement must identify its field').toBeVisible();
      await expect(field).toHaveValue(invalid);
      expect(await readPersistence(page, info), 'Rejected drafts must not write any canonical rows').toEqual(before);
    }
    await page.getByLabel(`Elegir ${requirement.choice} para requisito ${index + 1}`, { exact: true }).click();
    await expect(field).toHaveValue(requirement.value);
  }
  await page.getByLabel('Alternar equipo Banco', { exact: true }).click();
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Requisito 1 (' }), 'Missing equipment must reject the exact requirement').toBeVisible();
  expect(await readPersistence(page, info)).toEqual(before);
  await page.getByLabel('Alternar equipo Banco', { exact: true }).click();
  await page.getByLabel('Restricciones activas', { exact: true }).fill('sin impacto');
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Requisito 3 (' }), 'Impact restriction must reject the power requirement').toBeVisible();
  expect(await readPersistence(page, info)).toEqual(before);
  await page.getByLabel('Restricciones activas', { exact: true }).fill('lumbar');
  await save.click();
  await expect(page.getByText('Configuración guardada en este dispositivo.', { exact: true })).toBeVisible();
  const accepted = await readPersistence(page, info);
  const settings = JSON.parse(String(accepted.settings.find(row => row.key === 'training-settings')?.value_json));
  expect(settings.requirements).toEqual(cases.map(({ kind, value }) => ({ kind, value })));
  expect(settings.restrictions).toEqual(['lumbar']);
  expect(accepted.cycles).toEqual(before.cycles);
  expect(accepted.templates).toEqual(before.templates);
  expect(accepted.sessionSnapshots).toEqual(before.sessionSnapshots);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/settings');
  for (const requirement of cases) await expect(reopened.getByLabel(`Requisito ${requirement.kind}`, { exact: true })).toHaveValue(requirement.value);
  await expect(reopened.getByLabel('Restricciones activas', { exact: true })).toHaveValue('lumbar');
  expect(await readPersistence(reopened, info)).toEqual(accepted);
});

for (const scenario of [
  { name: 'original choices', choices: ['Press banca', 'horizontal-push', 'power'], ids: ['barbell-bench-press', 'barbell-bench-press', 'low-volume-jump'], names: ['Press banca', 'Salto de bajo volumen'] },
  { name: 'multiple compatible candidates', choices: ['Press banca', 'mobility', 'core'], ids: ['barbell-bench-press', 'hip-mobility', 'bird-dog'], names: ['Press banca', 'Movilidad de cadera', 'Bird-dog'] },
]) {
test(`chosen requirement kinds retain catalog prescriptions from preview through activation and reopen: ${scenario.name}`, async ({ page, context }, info) => {
  await page.goto('/settings');
  const choices = scenario.choices;
  for (const [index, choice] of choices.entries()) {
    await page.getByLabel(`Elegir ${choice} para requisito ${index + 1}`, { exact: true }).click();
  }
  await page.getByLabel('Restricciones activas', { exact: true }).fill('lumbar');
  await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  await expect(page.getByText('Configuración guardada en este dispositivo.', { exact: true })).toBeVisible();
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  await page.getByRole('button', { name: /Semana 1 de Reentrada/ }).click();
  const preview = await readPersistence(page, info);
  expect(preview.templates).toHaveLength(1);
  expect(preview.cycles.every(row => row.status === 'READY')).toBe(true);
  const snapshots = JSON.parse(String(preview.templates[0]!.snapshot_json)) as import('../../src/domain/prescriptions/generator').CyclePrescriptionSnapshot[];
  for (const cycle of snapshots) for (const week of cycle.weeks) for (const session of week.sessions) {
    const requested = session.exercises.filter(exercise => scenario.ids.includes(exercise.exerciseId));
    expect(requested.map(exercise => [exercise.requirement, exercise.exerciseId]), 'Chosen requirement kinds must resolve to deterministic catalog IDs').toEqual(expect.arrayContaining([
      ['EXACT', scenario.ids[0]], ['PATTERN', scenario.ids[1]], ['CAPABILITY', scenario.ids[2]],
    ]));
    for (const exercise of requested) {
      expect(exercise.target.sets).toBeGreaterThan(0);
      expect(exercise.target.reps.min).toBeGreaterThan(0);
      expect(exercise.target.reps.max).toBeGreaterThanOrEqual(exercise.target.reps.min);
    }
  }
  for (const name of scenario.names) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: /Semana 1 de Reentrada/ }).click();
  await page.getByRole('button', { name: 'Activar plan confirmado', exact: true }).click();
  await expect(page.getByText('Plan activo', { exact: true })).toBeVisible();
  const active = await readPersistence(page, info);
  expect(active.cycles.filter(row => row.status === 'ACTIVE')).toHaveLength(1);
  expect(active.templates).toEqual(preview.templates);
  expect(active.sessionSnapshots, 'Activation must preserve previewed session prescriptions').toEqual(preview.sessionSnapshots);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/plan');
  await expect(reopened.getByText('Plan activo', { exact: true })).toBeVisible();
  expect(await readPersistence(reopened, info)).toEqual(active);
  await info.attach('preview-and-activation-readback', { body: JSON.stringify({ preview, active }, null, 2), contentType: 'application/json' });
});

}
