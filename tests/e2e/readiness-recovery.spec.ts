import { test, expect } from '@playwright/test';
import { readPersistence } from './persistence';

test('saved stopped preparation recovers its actual input and keeps direct workout entry blocked', async ({page,context},info) => {
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

 await page.getByRole('radio',{name:'Región lumbar',exact:true}).click();
 await page.getByLabel('Dolor persiste después de una modificación',{exact:true}).click();
 await expect(page.getByText('Dolor registrado: 3 de 10 · estable · persiste después de modificar',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Confirmar preparación',{exact:true})).toHaveCount(0);
 const before=await readPersistence(page,info); const saved=before.settings.find(row => String(row.key).startsWith('session-readiness:'))!;
 expect(JSON.parse(String(saved.value_json))).toMatchObject({input:{pain:3,painTrend:'stable',region:'lumbar',persistsAfterModification:true},sessionStatus:'PATTERN_STOPPED',explanation:expect.stringContaining('persistió')});
 await page.getByLabel('Cerrar Preparación de hoy',{exact:true}).click();
 await page.getByRole('button',{name:'Revisar preparación para entrenar',exact:true}).click();
 await expect(page.getByText('Preparación guardada · Región: lumbar',{exact:true})).toBeVisible();
 await page.close(); const reopened=await context.newPage(); await reopened.goto('/');
 await expect(reopened.getByText('Dolor registrado: 3 de 10 · estable · persiste después de modificar',{exact:true})).toBeVisible();
 await reopened.screenshot({path:info.outputPath('saved-preparation.png'),fullPage:true});
 expect((await readPersistence(reopened,info)).settings.find(row=>row.key===saved.key)).toEqual(saved);
 await reopened.goto('/workout');
 await expect(reopened.getByRole('button',{name:'Completar serie 1',exact:true})).toHaveCount(0);
 expect((await readPersistence(reopened,info)).workouts).toEqual(before.workouts);
});
