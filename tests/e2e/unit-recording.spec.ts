import { test, expect, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { startSyntheticWorkout, isLastWorkoutExercise } from './setup';
import { readPersistence } from './persistence';

async function units(page:Page,unit:'kg'|'lb') {
 await page.goto('/settings');
 await page.getByRole('radio',{name:`Usar ${unit}`,exact:true}).click();
 await page.getByRole('button',{name:'Guardar configuración local',exact:true}).click();
 await expect(page.getByText('Configuración guardada en este dispositivo.',{exact:true})).toBeVisible();
}
test('records pounds and kilograms without reinterpreting drafts, history or encrypted backups',async({page,context},info)=>{
 test.setTimeout(180_000);
 await startSyntheticWorkout(page);
 const load=()=>page.getByLabel('Carga de la serie 1',{exact:true});
 await load().fill('45,359237');
 await page.getByRole('button',{name:'Completar serie 1',exact:true}).click();
 await units(page,'lb');await page.close();page=await context.newPage();await page.goto('/workout');
 await expect(page.getByText('Carga (lb)',{exact:true}).first()).toBeVisible();
 await expect(load()).toHaveValue('100');
 await page.getByLabel('Carga de la serie 2',{exact:true}).fill('100');
 await load().fill('-20');await expect(page.getByRole('alert')).toContainText('sin valores negativos');
 await expect(load()).toHaveValue('-20');
 await expect(page.getByRole('button',{name:'Completar serie 1',exact:true})).toBeDisabled();
 // Reopen with a different unit; display never becomes the persistence source.
 for(const unit of ['kg','lb','kg'] as const) {
  await units(page,unit);await page.close();page=await context.newPage();await page.goto('/workout');
  await expect(load()).toHaveValue(unit==='kg'?'45,359237':'100');
  await expect(page.getByLabel('Carga de la serie 2',{exact:true})).toHaveValue(unit==='kg'?'45.359237':'100');
 }
 // Complete the real session through production controls.
 for(let exercise=0;exercise<15;exercise++){
  const completes=page.getByRole('button',{name:/^Completar serie \d+$/});
  for(let set=0;set<await completes.count();set++)await completes.nth(set).click();
  if(await isLastWorkoutExercise(page))break;
  await page.getByRole('button',{name:'Siguiente ejercicio',exact:true}).click();
 }
 await page.getByRole('button',{name:'Revisar y terminar entrenamiento',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar fin de entrenamiento',exact:true}).click();
 await expect(page).toHaveURL(/4179\/$/);
 await page.goto('/history');
 await expect(page.getByText('Serie 1: 45.359237 kg × 5',{exact:true})).toBeVisible();
 await expect(page.getByText('Serie 2: 45.359237 kg × 5',{exact:true})).toBeVisible();
 await readPersistence(page,info);let db=new DatabaseSync(info.outputPath('canonical.sqlite'));
 const row=db.prepare("SELECT actual_snapshot_json FROM workout_session WHERE status='COMPLETED'").get()!;
 const actual=JSON.parse(String(row.actual_snapshot_json));
 expect(actual.exercises[0].sets[0]).toMatchObject({load:'45.359237',loadUnit:'kg',loadEntry:{value:'45,359237',unit:'kg'}});
 expect(actual.exercises[0].sets[1]).toMatchObject({load:'45.359237',loadUnit:'kg',loadEntry:{value:'100',unit:'lb'}});db.close();
 await page.goto('/backup');await page.getByLabel('Contraseña portátil del respaldo',{exact:true}).fill('synthetic-units-roundtrip');
 await page.getByRole('button',{name:'Exportar respaldo cifrado',exact:true}).click();
 await expect(page.getByText('Respaldo cifrado y autenticado listo para guardar.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Revisar respaldo antes de restaurar',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar restauración del respaldo',exact:true}).click();
 await expect(page.getByText('Respaldo restaurado de forma atómica.',{exact:true})).toBeVisible();
 await page.close();page=await context.newPage();await page.goto('/history');
 await expect(page.getByText('Serie 2: 45.359237 kg × 5',{exact:true})).toBeVisible();
 await readPersistence(page,info);db=new DatabaseSync(info.outputPath('canonical.sqlite'));
 expect(db.prepare("SELECT actual_snapshot_json FROM workout_session WHERE status='COMPLETED'").get()).toEqual(row);db.close();
 await page.screenshot({path:info.outputPath('unit-history.png'),fullPage:true});
});
