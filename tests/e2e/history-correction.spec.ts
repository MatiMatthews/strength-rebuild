import { fieldContrast } from './field-contrast';
import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readPersistence } from './persistence';

test('edits each recorded set with effective metrics, ordered audit and immutable originals after cold reopen', async ({page,context},info)=>{
 test.setTimeout(180_000);
 await page.goto('/plan'); await page.getByRole('button',{name:'Crear vista previa del ciclo',exact:true}).click();
 await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
 await readPersistence(page,info);await page.close();
 const db=new DatabaseSync(info.outputPath('canonical.sqlite'));
 const set={load:'60',reps:'8',rir:'2',technique:'Limpia',pain:0,notes:'Original',completed:true,skipped:false,disposition:'COMPLETED'};
 const actual={id:'recorded',exercises:[{exerciseId:'barbell-bench-press',originalExerciseId:'barbell-bench-press',requirement:'EXACT',sets:[set,{...set},{...set,completed:false,skipped:true,disposition:'SKIPPED',skipReason:'Rest'}]}],safetyModifications:[]};
 db.prepare("INSERT INTO workout_session (id,schema_version,created_at,updated_at,status,prescribed_snapshot_json,actual_snapshot_json,completed_at) VALUES ('recorded',1,'now','now','COMPLETED',?,?,'2026-09-05')").run(JSON.stringify({dayIndex:1,exercises:[]}),JSON.stringify(actual));db.close();
    const fixture = await context.newPage();
    await fixture.route('**/__synthetic_fixture', route => route.fulfill({ contentType: 'text/html', body: '<title>Synthetic fixture</title>' }));
    await fixture.goto('/__synthetic_fixture');
    await fixture.evaluate(async bytes => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('expo-sqlite');
      const handles = directory as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemFileHandle> };
      let changed = 0;
      for await (const handle of handles.values()) {
        if (handle.kind !== 'file') continue;
        const data = new Uint8Array(await (await handle.getFile()).arrayBuffer());
        const name = new TextDecoder().decode(data.slice(0, 512)).split('\0')[0];
        if (!name?.endsWith('/strength-rebuild-v2.db')) continue;
        const writer = await handle.createWritable();
        await writer.write(data.slice(0, 4096));
        await writer.write(new Uint8Array(bytes));
        await writer.close();
        changed++;
      }
      if (changed !== 1) throw new Error(`Expected one synthetic database, changed ${changed}`);
    }, Array.from(readFileSync(info.outputPath('canonical.sqlite'))));

  await fixture.close();


 let app=await context.newPage();await app.goto('/history');
 await expect(app.getByRole('button',{name:'Corregir serie 2 de Press banca',exact:true})).toBeVisible();
 const original=(await readPersistence(app,info)).workouts;
 const events=async()=>{await readPersistence(app,info);const d=new DatabaseSync(info.outputPath('canonical.sqlite'));try{return d.prepare("SELECT * FROM decision_log WHERE decision_type='HISTORY_CORRECTION' ORDER BY rowid").all();}finally{d.close();}};
 await app.getByRole('button',{name:'Corregir serie 2 de Press banca',exact:true}).click();
 await app.getByLabel('Carga corregida',{exact:true}).fill('50');
 await app.getByRole('button',{name:'Cancelar corrección',exact:true}).click();expect(await events()).toEqual([]);
 await app.getByRole('button',{name:'Corregir serie 1 de Press banca',exact:true}).click();
 await app.getByLabel('Carga corregida',{exact:true}).fill('');await app.getByLabel('Motivo de la corrección',{exact:true}).fill('Plate count');
 await app.getByRole('button',{name:'Confirmar corrección del historial',exact:true}).click();
 await expect(app.getByText('La carga corregida debe ser un número válido de 0 o más.',{exact:true})).toBeVisible();expect(await events()).toEqual([]);
 for (const colorScheme of ['light','dark'] as const) { await app.emulateMedia({colorScheme}); for (const label of ['Carga corregida','Motivo de la corrección']) await fieldContrast(app.getByLabel(label,{exact:true}),info,'history-field'); }
 await app.getByLabel('Carga corregida',{exact:true}).fill('55');
 await app.getByRole('button',{name:'Confirmar corrección del historial',exact:true}).evaluate((b:HTMLElement)=>{b.click();b.click();});
 await expect(app.getByText('Serie 1: 55 kg × 8',{exact:true})).toBeVisible();
 await expect(app.getByTestId('progress-metric-strip')).toContainText('920');expect(await events()).toHaveLength(1);
 await app.getByRole('button',{name:'Corregir serie 2 de Press banca',exact:true}).click();
 await app.getByLabel('Carga corregida',{exact:true}).fill('50');await app.getByLabel('Motivo de la corrección',{exact:true}).fill('Second set');
 await app.getByRole('button',{name:'Confirmar corrección del historial',exact:true}).click();
 await expect(app.getByText('Serie 2: 50 kg × 8',{exact:true})).toBeVisible();
 await app.close();app=await context.newPage();await app.goto('/history');
 await expect(app.getByText('Serie 1: 55 kg × 8',{exact:true})).toBeVisible();
 await expect(app.getByText('Serie 2: 50 kg × 8',{exact:true})).toBeVisible();
 await expect(app.getByTestId('progress-metric-strip')).toContainText('840');
 await expect(app.getByText(/original 60 kg · 60 → 55 kg · Plate count/)).toBeVisible();
 await expect(app.getByRole('button',{name:'Corregir serie 3 de Press banca',exact:true})).toHaveCount(0);
 expect((await readPersistence(app,info)).workouts).toEqual(original);
 const audit=await events();expect(audit).toHaveLength(2);
 expect(audit.map(e=>JSON.parse(String(e.inputs_json)).before.load)).toEqual(['60','60']);

 const units=async(unit:'kg'|'lb')=>{
  await app.goto('/settings');await app.getByRole('radio',{name:`Usar ${unit}`,exact:true}).click();
  await app.getByRole('button',{name:'Guardar configuración local',exact:true}).click();
  await expect(app.getByText('Configuración guardada en este dispositivo.',{exact:true})).toBeVisible();
  await app.close();app=await context.newPage();await app.goto('/history');
 };
 await units('lb');
 await expect(app.getByText('Serie 1: 121.2542442 lb × 8',{exact:true})).toBeVisible();
 await expect(app.getByText(/original 132.27735731 lb/).first()).toBeVisible();
 await expect(app.getByTestId('progress-metric-strip')).toContainText('1.851,883 lb');
 await app.getByRole('button',{name:'Corregir serie 1 de Press banca',exact:true}).click();
 await expect(app.getByLabel('Carga corregida',{exact:true})).toHaveValue('121.2542442');
 await app.getByLabel('Motivo de la corrección',{exact:true}).fill('Unchanged display');
 await app.getByRole('button',{name:'Confirmar corrección del historial',exact:true}).click();
 await expect(app.getByText('Corrección registrada; el historial original permanece intacto.',{exact:true})).toBeVisible();
 expect(await events()).toHaveLength(2);
 await app.getByRole('button',{name:'Corregir serie 2 de Press banca',exact:true}).click();
 await app.getByLabel('Carga corregida',{exact:true}).fill('-10');
 await app.getByLabel('Motivo de la corrección',{exact:true}).fill('Pounds correction');
 await app.getByRole('button',{name:'Confirmar corrección del historial',exact:true}).click();
 await expect(app.getByText('La carga corregida debe ser un número válido de 0 o más.',{exact:true})).toBeVisible();
 expect(await events()).toHaveLength(2);
 await app.getByLabel('Carga corregida',{exact:true}).fill('121,2542442');
 await app.getByRole('button',{name:'Confirmar corrección del historial',exact:true}).evaluate((b:HTMLElement)=>{b.click();b.click();});
 await expect(app.getByText('Serie 2: 121.2542442 lb × 8',{exact:true})).toBeVisible();
 const mixedAudit=await events();expect(mixedAudit).toHaveLength(3);
 expect(JSON.parse(String(mixedAudit[2]!.inputs_json)).after).toMatchObject({load:'55',loadUnit:'kg',loadEntry:{value:'121,2542442',unit:'lb'}});
 await expect(app.getByText(/entrada 121,2542442 lb/)).toBeVisible();
 for(const unit of ['kg','lb','kg'] as const){
  await units(unit);await expect(app.getByText(`Serie 1: ${unit==='kg'?'55 kg':'121.2542442 lb'} × 8`,{exact:true})).toBeVisible();
  expect(await events()).toEqual(mixedAudit);
 }
 await expect(app.getByTestId('progress-metric-strip')).toContainText('880 kg');
 await app.goto('/backup');await app.getByLabel('Contraseña portátil del respaldo',{exact:true}).fill('synthetic-history-units');
 await app.getByRole('button',{name:'Exportar respaldo cifrado',exact:true}).click();
 await expect(app.getByText('Respaldo cifrado y autenticado listo para guardar.',{exact:true})).toBeVisible();
 await app.getByRole('button',{name:'Revisar respaldo antes de restaurar',exact:true}).click();
 await app.getByRole('button',{name:'Confirmar restauración del respaldo',exact:true}).click();
 await expect(app.getByText('Respaldo restaurado de forma atómica.',{exact:true})).toBeVisible();
 await app.close();app=await context.newPage();await app.goto('/history');
 await expect(app.getByText('Serie 2: 55 kg × 8',{exact:true})).toBeVisible();
 expect(await events()).toEqual(mixedAudit);expect((await readPersistence(app,info)).workouts).toEqual(original);
 await app.screenshot({path:info.outputPath('history.png'),fullPage:true});
});
