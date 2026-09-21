import { test, expect } from '@playwright/test';
import { readPersistence } from './persistence';
import { changeCycleFixture } from './cycle-fixture';

const settingsValue = (state: Awaited<ReturnType<typeof readPersistence>>) => JSON.parse(String(state.settings.find(row => row.key === 'training-settings')!.value_json));
const exercises = (state: Awaited<ReturnType<typeof readPersistence>>) => state.sessionSnapshots.flatMap(row => JSON.parse(String(row.snapshot_json)).exercises);

test('fresh personal previews never select demo or invent unknown reference loads', async ({ page, context }, info) => {
  await page.goto('/settings');
  await expect(page.getByLabel('No sé mi referencia de Press banca', { exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const saved = settingsValue(await readPersistence(page, info));
  expect(saved.profile).toEqual({}); expect(saved.demoProfileId).toBeUndefined();
  expect(Object.values(saved.referenceSources)).toEqual(['unknown','unknown','unknown','unknown']);
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const state = await readPersistence(page, info);
  expect(exercises(state).length).toBeGreaterThan(0);
  expect(exercises(state).every(e => e.calculatedLoad === undefined && e.loadSource === undefined)).toBe(true);
  await page.getByRole('button', { name: /Semana 1 de Fuerza/ }).click();
  await expect(page.getByText('Carga por definir', { exact: true }).first()).toBeVisible();
  const selected = await readPersistence(page, info);
  expect(selected).toEqual({ ...state, settings: [...state.settings, { key: 'plan-week-selection', value_json: JSON.stringify('strength-draft-1') }].sort((a, b) => String(a.key).localeCompare(String(b.key))) });
  await page.close(); const reopened = await context.newPage(); await reopened.goto('/settings');
  await expect(reopened.getByLabel('No sé mi referencia de Press banca', { exact: true })).toHaveAttribute('aria-checked','true');
  expect(await readPersistence(reopened, info)).toEqual(selected);
});

test('personal reference save, invalid input, cancel and unknown preserve active work and refresh future previews', async ({ page, context }, info) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const original = await readPersistence(page, info);
  await page.goto('/settings');
  await page.getByLabel('Conozco mi referencia de Press banca', { exact: true }).click();
  const field = page.getByLabel('Referencia de Press banca', { exact: true });
  const save = page.getByRole('button', { name: 'Guardar configuración local', exact: true });
  for (const value of ['60,','0','-1','60,5,2']) {
    await field.fill(value); await save.click();
    await expect(page.getByText(/Press banca: escribe/)).toBeVisible();
    await expect(field).toHaveValue(value); expect(await readPersistence(page, info)).toEqual(original);
  }
  await field.fill('60,5');
  await page.getByRole('button', { name: 'Cancelar cambios de configuración', exact: true }).click();
  expect(await readPersistence(page, info)).toEqual(original);
  await page.getByLabel('Conozco mi referencia de Press banca', { exact: true }).click();
  await field.fill('60,5'); await save.click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const saved = await readPersistence(page, info);
  expect(settingsValue(saved)).toMatchObject({profile:{benchPressReference:60.5},profileUnit:'kg',referenceSources:{benchPressReference:'user',backSquatReference:'unknown'}});
  expect(saved.sessionSnapshots).toEqual(original.sessionSnapshots); expect(saved.workouts).toEqual(original.workouts);
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const preview = await readPersistence(page, info);
  const oldIds = new Set(original.sessionSnapshots.map(row => row.id));
  expect(preview.sessionSnapshots.filter(row => oldIds.has(row.id))).toEqual(original.sessionSnapshots);
  const loads = exercises({...preview,sessionSnapshots:preview.sessionSnapshots.filter(row=>!oldIds.has(row.id))}).filter(e=>e.calculatedLoad!==undefined);
  expect(loads.length).toBeGreaterThan(0);
  expect(loads.every(e=>e.exerciseId==='barbell-bench-press' && e.calculatedLoad===48.75 && e.loadSource.value===60.5)).toBe(true);
  expect(preview.workouts).toEqual(original.workouts);
  await page.close(); const reopened=await context.newPage(); await reopened.goto('/settings');
  await expect(reopened.getByLabel('Referencia de Press banca',{exact:true})).toHaveValue('60.5');
  expect(await readPersistence(reopened,info)).toEqual(preview);
  await reopened.goto('/plan');
  await reopened.getByRole('button',{name:'Activar plan confirmado',exact:true}).click();
  await expect(reopened.getByText('Plan activo',{exact:true})).toBeVisible();
  await reopened.goto('/');
  await reopened.getByRole('button',{name:'Revisar preparación para entrenar',exact:true}).click();
  await reopened.getByLabel('Dolor de 0 a 2, estable',{exact:true}).click();
  await reopened.getByRole('button',{name:'Confirmar preparación',exact:true}).click();
  await expect(reopened.getByTestId('workout-screen')).toBeVisible();
  const active = await readPersistence(reopened,info);
  expect(active.workouts.length).toBe(1);
  await reopened.goto('/settings');
  await reopened.getByLabel('No sé mi referencia de Press banca',{exact:true}).click();
  await reopened.getByRole('button',{name:'Guardar configuración local',exact:true}).click();
  await expect(reopened.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const unknown = await readPersistence(reopened,info);
  expect(settingsValue(unknown).profile).toEqual({});
  expect(settingsValue(unknown).referenceSources.benchPressReference).toBe('unknown');
  expect(unknown.workouts).toEqual(active.workouts); expect(unknown.sessionSnapshots).toEqual(active.sessionSnapshots);
});

test('legacy references and marker survive reopen and unrelated unit edits without reinterpretation', async ({page,context},info)=>{
  await page.goto('/settings');
  await page.getByRole('button',{name:'Guardar configuración local',exact:true}).click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const legacy={...settingsValue(await readPersistence(page,info)),demoProfileId:'synthetic-strength-demo-v1',profile:{benchPressReference:60,deadliftReference:100,backSquatReference:80,strictPullUpCapacity:5}};
  delete legacy.profileUnit; delete legacy.referenceSources;
  let app=await changeCycleFixture(page,context,info,db=>db.prepare("UPDATE app_setting SET value_json=? WHERE key='training-settings'").run(JSON.stringify(legacy)));
  for(let i=0;i<2;i++) {
    await app.goto('/settings'); await expect(app.getByLabel('Referencia de Press banca',{exact:true})).toHaveValue('60');
    expect(settingsValue(await readPersistence(app,info))).toEqual(legacy);
    await app.close(); app=await context.newPage();
  }
  await app.goto('/settings'); await app.getByLabel('Usar lb',{exact:true}).click();
  await app.getByRole('button',{name:'Guardar configuración local',exact:true}).click();
  await expect(app.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const saved=settingsValue(await readPersistence(app,info));
  expect(saved).toEqual({...legacy,units:'lb',profileUnit:'kg'});
  await app.goto('/plan'); await app.getByRole('button',{name:'Crear vista previa del ciclo',exact:true}).click();
  await expect(app.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const loads=exercises(await readPersistence(app,info)).filter(e=>e.calculatedLoad!==undefined);
  expect(loads.length).toBeGreaterThan(0);
  expect(loads.every(e=>e.exerciseId==='barbell-bench-press' && e.loadUnit==='lb' && e.calculatedLoad===106.25)).toBe(true);
  await app.close(); app=await context.newPage(); await app.goto('/settings');
  await expect(app.getByLabel('Referencia de Press banca',{exact:true})).toHaveValue('60');
  await expect(app.getByText('Press banca (kg)',{exact:true})).toBeVisible();
});
