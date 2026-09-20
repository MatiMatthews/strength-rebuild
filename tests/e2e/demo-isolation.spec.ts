import { test, expect, type Page } from '@playwright/test';
import { readPersistence } from './persistence';
import { startSyntheticWorkout, fillSetQuantity, openSetNotes } from './setup';
import { changeCycleFixture } from './cycle-fixture';

const demoFile = 'strength-rebuild-demo.db';
async function enterDemo(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Probar demo', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar en demo', exact: true }).click();
  await expect(page.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toBeVisible();
  await page.goto('/settings');
}

test('explicit demo preserves personal settings, legacy marker, setup, history and active workout across restart', async ({ page, context }, info) => {
  test.setTimeout(180_000);
  await startSyntheticWorkout(page);
  await fillSetQuantity(page, 1);
  await (await openSetNotes(page, 1)).fill('Synthetic persistence smoke');
  await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click();
  await expect.poll(async () => (await readPersistence(page, info)).sets.length).toBe(1);
  // Add immutable synthetic history and a legacy marker beside real active work.
  let app = await changeCycleFixture(page, context, info, db => {
    const metadata = [new Date().toISOString(), new Date().toISOString()];
    db.prepare("INSERT INTO app_setting(id,schema_version,created_at,updated_at,key,value_json) VALUES ('setup-draft',1,?,?,'setup-draft',?)").run(...metadata, JSON.stringify({ step: 2, goal: 'strength' }));
    db.prepare("INSERT INTO app_setting(id,schema_version,created_at,updated_at,key,value_json) VALUES ('training-settings',1,?,?,'training-settings',?)").run(...metadata, JSON.stringify({ units:'kg', increments:[2.75],equipment:['Barra','Banco'],schedule:[1,3,5],requirements:[{kind:'EXACT',value:'barbell-bench-press'}],restrictions:[],demoProfileId:'synthetic-strength-demo-v1',profile:{benchPressReference:87} }));
    db.exec("INSERT INTO workout_session SELECT 'synthetic-completed',schema_version,created_at,updated_at,session_plan_id,'COMPLETED',prescribed_snapshot_json,actual_snapshot_json,'2026-09-01T12:00:00Z' FROM workout_session LIMIT 1");
  });
  await app.goto('/settings');
  await expect(app.getByLabel('Incremento 1', { exact: true })).toHaveValue('2.75');
  await expect(app.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toHaveCount(0);
  const personal = await readPersistence(app, info);
  await app.getByRole('button', { name: 'Probar demo', exact: true }).click();
  await app.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await readPersistence(app, info)).toEqual(personal);
  await enterDemo(app);
  await expect(app.getByLabel('Referencia de Press banca', { exact: true })).toHaveValue('60');
  await app.getByLabel('Incremento 1', { exact: true }).fill('5');
  await app.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  await expect(app.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  await startSyntheticWorkout(app);
  await fillSetQuantity(app, 1, '6');
  await (await openSetNotes(app, 1)).fill('Synthetic persistence smoke');
  await app.getByRole('button', { name: 'Completar serie 1', exact: true }).click();
  await expect.poll(async () => (await readPersistence(app, info, demoFile)).sets.length).toBe(1);
  const demo = await readPersistence(app, info, demoFile);
  expect(demo.workouts).toHaveLength(1); expect(personal.workouts).toHaveLength(2);
  expect(await readPersistence(app, info)).toEqual(personal);
  await app.close(); app = await context.newPage(); await app.goto('/settings');
  await expect(app.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toBeVisible();
  await expect(app.getByLabel('Incremento 1', { exact: true })).toHaveValue('5');
  expect(await readPersistence(app, info, demoFile)).toEqual(demo);
  for (const route of ['/plan', '/history', '/backup']) {
    await app.goto(route); await expect(app.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toBeVisible();
  }
  await expect(app.getByRole('button', { name: 'Exportar respaldo cifrado', exact: true })).toHaveCount(0);
  await app.screenshot({ path: info.outputPath('demo-backup-boundary.png') });
  await app.getByRole('button', { name: 'Salir de la demo', exact: true }).click();
  await expect(app.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toHaveCount(0);
  expect(await readPersistence(app, info)).toEqual(personal);
  await app.close(); app = await context.newPage(); await app.goto('/settings');
  await expect(app.getByLabel('Incremento 1', { exact: true })).toHaveValue('2.75');
  expect(await readPersistence(app, info)).toEqual(personal);
  await enterDemo(app);
  expect(await readPersistence(app, info, demoFile)).toEqual(demo);
  await app.getByRole('button', { name: 'Salir de la demo', exact: true }).click();
  await expect(app.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toHaveCount(0);
  expect(await readPersistence(app, info)).toEqual(personal);
});

test('failed and repeated demo entry keep fresh personal references unknown and allow a deliberate retry', async ({ page }, info) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, transfer) {
      const state = window as unknown as { failDemo?: boolean };
      if (state.failDemo && !message.isSync && message.type === 'prepare' && String(message.data?.source).includes('UPDATE data_mode')) {
        delete state.failDemo;
        this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, error: 'Synthetic mode write failure' } })); return;
      }
      post.call(this, message, Array.isArray(transfer) ? { transfer } : transfer);
    };
  });
  await page.goto('/settings');
  await expect(page.getByLabel('No sé mi referencia de Press banca', { exact: true })).toHaveAttribute('aria-checked', 'true');
  const personal = await readPersistence(page, info);
  await page.getByRole('button', { name: 'Probar demo', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { failDemo: boolean }).failDemo = true; });
  const enter = page.getByRole('button', { name: 'Entrar en demo', exact: true });
  await enter.evaluate(element => { (element as HTMLElement).click(); (element as HTMLElement).click(); });
  await expect(page.getByText('No se pudo cambiar de modo. Tus datos se conservaron. Reintenta.')).toBeVisible();
  await expect(page.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toHaveCount(0);
  expect(await readPersistence(page, info)).toEqual(personal);
  await enter.click();
  await expect(page.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { failDemo: boolean }).failDemo = true; });
  await page.getByRole('button', { name: 'Salir de la demo', exact: true }).click();
  await expect(page.getByText('No se pudo cambiar de modo. Tus datos se conservaron. Reintenta.')).toBeVisible();
  await expect(page.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toBeVisible();
  expect(await readPersistence(page, info)).toEqual(personal);
  await page.getByRole('button', { name: 'Salir de la demo', exact: true }).click();
  await expect(page.getByText('DEMO · DATOS DE EJEMPLO', { exact: true })).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByLabel('No sé mi referencia de Press banca', { exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(await readPersistence(page, info)).toEqual(personal);
});
