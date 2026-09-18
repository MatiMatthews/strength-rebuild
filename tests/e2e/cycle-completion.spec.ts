import {test,expect} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import {copyFileSync} from 'node:fs';
import {changeCycleFixture,finalWeekFixture} from './cycle-fixture';
import {readPersistence} from './persistence';

test('review final week, confirm transition, train/review deload and explicitly activate next loading cycle',async({page,context},info)=>{
  test.setTimeout(180_000);
  await page.goto('/plan');
  await page.getByRole('button',{name:'Crear vista previa del ciclo',exact:true}).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const app=await changeCycleFixture(page,context,info,finalWeekFixture);
  copyFileSync(info.outputPath('canonical.sqlite'),info.outputPath('final-week-fixture.sqlite'));
  await app.goto('/');
  await app.getByRole('button',{name:'Abrir revisión semanal',exact:true}).click();
  await app.getByRole('button',{name:'Crear propuesta semanal',exact:true}).click();
  await app.getByRole('button',{name:'Mantener plan semanal',exact:true}).click();
  await app.getByRole('button',{name:'Volver a Hoy',exact:true}).click();
  const before=await readPersistence(app,info);
  await app.getByRole('button',{name:'Revisar siguiente ciclo',exact:true}).click();
  await expect(app.getByText('Activar: Transición · descarga',{exact:true})).toBeVisible();
  await app.screenshot({path:info.outputPath('transition-preview.png'),fullPage:true});
  await app.getByRole('button',{name:'Cancelar cambio de ciclo',exact:true}).click();
  await app.reload();expect(await readPersistence(app,info)).toEqual(before);
  await app.goto('/plan');
  await app.getByRole('button',{name:'Revisar siguiente ciclo',exact:true}).click();
  await app.getByRole('button',{name:'Confirmar cambio de ciclo',exact:true}).dblclick();
  await expect(app.getByText('Cambio de ciclo guardado.',{exact:true})).toBeVisible();
  await app.goto('/');await app.reload();
  const transitioned=await readPersistence(app,info);
  expect(transitioned.cycles.filter(c=>c.status==='ACTIVE').map(c=>c.kind)).toEqual(['transition']);
  expect(transitioned.sessionSnapshots).toEqual(before.sessionSnapshots);
  expect(transitioned.settings).toEqual(before.settings);expect(transitioned.workouts).toEqual(before.workouts);
  await app.goto('/cycle-completion');
  await expect(app.getByText('Completa las sesiones de descarga y su revisión semanal antes de continuar.',{exact:true})).toBeVisible();
  await expect(app.getByRole('button',{name:'Confirmar cambio de ciclo',exact:true})).toHaveCount(0);
  for(let day=0;day<3;day++) {
    await app.goto('/');
    await app.getByRole('button',{name:'Revisar preparación para entrenar',exact:true}).click();
    await app.getByLabel('Dolor de 0 a 2, estable',{exact:true}).click();
    await app.getByRole('button',{name:'Confirmar preparación',exact:true}).click();
    await app.getByLabel('Repeticiones de la serie 1',{exact:true}).fill('5');
    await app.getByRole('button',{name:'Completar serie 1',exact:true}).click();
    await app.getByRole('button',{name:'Revisar y terminar entrenamiento',exact:true}).click();
    await app.getByRole('button',{name:'Confirmar fin de entrenamiento',exact:true}).click();
    await expect(app.getByTestId('finish-review')).not.toBeVisible();
    await app.goto('/');
  }
  await app.goto('/');
  await app.getByRole('button',{name:'Abrir revisión semanal',exact:true}).click();
  await app.getByRole('button',{name:'Crear propuesta semanal',exact:true}).click();
  await app.getByRole('button',{name:'Mantener plan semanal',exact:true}).click();
  await app.getByRole('button',{name:'Volver a Hoy',exact:true}).click();
  await app.getByRole('button',{name:'Revisar siguiente ciclo',exact:true}).click();
  await expect(app.getByText('Activar: Fuerza',{exact:true})).toBeVisible();
  await app.getByRole('button',{name:'Confirmar cambio de ciclo',exact:true}).click();
  await expect(app.getByText('Cambio de ciclo guardado.',{exact:true})).toBeVisible();
  await app.goto('/');await app.reload();
  const final=await readPersistence(app,info);
  expect(final.cycles.filter(c=>c.status==='ACTIVE').map(c=>c.kind)).toEqual(['strength']);
  expect(final.sessionSnapshots).toEqual(before.sessionSnapshots);
  expect(final.workouts).toHaveLength(3);
  const db=new DatabaseSync(info.outputPath('canonical.sqlite'),{readOnly:true});
  expect(db.prepare("SELECT * FROM decision_log WHERE policy_version='cycle-completion-v1'").all()).toHaveLength(2);db.close();
  await app.getByRole('button',{name:'Revisar preparación para entrenar',exact:true}).click();
  await app.getByLabel('Dolor de 0 a 2, estable',{exact:true}).click();
  await app.getByRole('button',{name:'Confirmar preparación',exact:true}).click();
  await expect(app.getByTestId('workout-screen')).toBeVisible();
  await app.screenshot({path:info.outputPath('next-loading-workout.png'),fullPage:true});
});

for(const negative of ['unfinished','restriction','write-failure','stale-next']) test(`cycle confirmation preserves data on ${negative}`,async({page,context},info)=>{
  await page.goto('/plan');await page.getByRole('button',{name:'Crear vista previa del ciclo',exact:true}).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const app=await changeCycleFixture(page,context,info,db=>{
    finalWeekFixture(db);
    if(negative!=='unfinished') db.exec("UPDATE training_week SET status='COMPLETED' WHERE cycle_id IN (SELECT id FROM cycle WHERE status='ACTIVE')");
    if(negative==='restriction') db.exec("INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json,active) VALUES ('synthetic-safety',1,'now','now','pain','{}',1)");
    if(negative==='stale-next') db.exec("CREATE TRIGGER stale_next BEFORE UPDATE OF status ON cycle WHEN OLD.status='ACTIVE' AND NEW.status='COMPLETED' BEGIN UPDATE cycle SET status='PAUSED' WHERE kind='transition' AND status='READY'; END");
    if(negative==='write-failure') db.exec("CREATE TRIGGER fail_completion BEFORE INSERT ON decision_log WHEN NEW.policy_version='cycle-completion-v1' BEGIN SELECT RAISE(ABORT,'synthetic cycle write failure'); END");
  });
  await app.goto('/cycle-completion');
  const before=await readPersistence(app,info);
  if(negative==='write-failure' || negative==='stale-next') {
    await app.getByRole('button',{name:'Confirmar cambio de ciclo',exact:true}).click();
    await expect(app.getByText(negative==='stale-next'?'El siguiente ciclo cambió.':'No se pudo guardar el cambio de ciclo. Tus datos se conservan; vuelve a intentarlo.',{exact:true})).toBeVisible();
    await expect(app.getByText('Activar: Transición · descarga',{exact:true})).toBeVisible();
  } else {
    await expect(app.getByRole('button',{name:'Confirmar cambio de ciclo',exact:true})).toHaveCount(0);
    await expect(app.getByText(negative==='restriction'?'Hay una restricción de seguridad activa. No se puede avanzar de ciclo.':'Completa todas las sesiones y revisiones semanales antes de continuar.',{exact:true})).toBeVisible();
  }
  expect(await readPersistence(app,info)).toEqual(before);
  await app.getByRole('button',{name:'Cancelar cambio de ciclo',exact:true}).click();
  await app.reload();expect(await readPersistence(app,info)).toEqual(before);
  if(negative==='write-failure') {
    const retry=await changeCycleFixture(app,context,info,db=>db.exec('DROP TRIGGER fail_completion'));
    await retry.goto('/cycle-completion');
    await retry.getByRole('button',{name:'Confirmar cambio de ciclo',exact:true}).click();
    await expect(retry.getByText('Cambio de ciclo guardado.',{exact:true})).toBeVisible();
    const persisted=await readPersistence(retry,info);
    expect(persisted.cycles.filter(c=>c.status==='ACTIVE').map(c=>c.kind)).toEqual(['transition']);
    expect(persisted.sessionSnapshots).toEqual(before.sessionSnapshots);
    expect(persisted.workouts).toEqual(before.workouts);
  }
});
