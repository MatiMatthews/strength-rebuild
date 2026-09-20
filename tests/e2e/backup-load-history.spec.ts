import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readPersistence as readRawPersistence } from './persistence';
import { startSyntheticWorkout } from './setup';
const readPersistence: typeof readRawPersistence = async (page,info) => {
 const result=await readRawPersistence(page,info);result.workouts.sort((a,b)=>String(a.id).localeCompare(String(b.id)));return result;
};

test('restores mixed load history and an active workout, rejecting invalid corrections without data loss', async ({page,context},info)=>{
 await startSyntheticWorkout(page);
 await readPersistence(page,info);await page.close();
 const db=new DatabaseSync(info.outputPath('canonical.sqlite'));
 const row=db.prepare('SELECT * FROM workout_session').get()!;
 const actual=JSON.parse(String(row.actual_snapshot_json));
 actual.exercises[0].exerciseId='barbell-bench-press';actual.exercises[0].originalExerciseId='barbell-bench-press';
 actual.exercises=[actual.exercises[0]];
 delete actual.exercises[0].recording;
 for(const set of actual.exercises[0].sets) delete set.seconds;
 actual.exercises[0].sets[0].load='100';actual.exercises[0].sets[0].reps='8';actual.exercises[0].sets[0].completed=true;actual.exercises[0].sets[0].disposition='COMPLETED';
 const prescribed={dayIndex:1,exercises:[{exerciseId:'barbell-bench-press',calculatedLoad:100,loadProvenance:'bench press reference 200 lb; training max reference; 50%; rounded to 5',target:{sets:2}}]};
 db.prepare('UPDATE workout_session SET prescribed_snapshot_json=?, actual_snapshot_json=?').run(JSON.stringify(prescribed),JSON.stringify(actual));
 const historical=structuredClone(actual);historical.id='historic';historical.exercises=[historical.exercises[0]];
 historical.exercises[0].sets=[historical.exercises[0].sets[0],{...historical.exercises[0].sets[0],load:'80'}, {...historical.exercises[0].sets[0],load:'100',loadUnit:'kg'},{...historical.exercises[0].sets[0],load:'50',loadUnit:'lb'},{...historical.exercises[0].sets[0],load:''}];
 db.prepare("INSERT INTO workout_session (id,schema_version,created_at,updated_at,status,prescribed_snapshot_json,actual_snapshot_json,completed_at) VALUES ('historic',1,'now','now','COMPLETED',?,?,'2026-09-05')").run(JSON.stringify(prescribed),JSON.stringify(historical));
 const originals=db.prepare('SELECT id,prescribed_snapshot_json,actual_snapshot_json FROM workout_session ORDER BY id').all();db.close();
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


 let app=await context.newPage();
 for(let i=0;i<2;i++){
  await app.goto('/history');
  await expect(app.getByText('Serie 1: 45.359237 kg × 8',{exact:true})).toBeVisible();
  await expect(app.getByText('Serie 2: 80 kg × 8',{exact:true})).toBeVisible();
  await expect(app.getByText('Serie 3: 100 kg × 8',{exact:true})).toBeVisible();
  await app.goto('/workout');
  await expect(app.getByLabel('Carga de la serie 1',{exact:true})).toHaveValue('45.359237');
  await expect(app.getByText('Carga (kg)',{exact:true}).first()).toBeVisible();
  await readPersistence(app,info);const saved=new DatabaseSync(info.outputPath('canonical.sqlite'));
  expect(saved.prepare('SELECT id,prescribed_snapshot_json,actual_snapshot_json FROM workout_session ORDER BY id').all()).toEqual(originals);saved.close();
  await app.close();app=await context.newPage();
 }
 await app.goto('/history');
 await app.getByRole('button',{name:'Corregir serie 1 de Press banca',exact:true}).click();
 await app.getByLabel('Carga corregida',{exact:true}).fill('40');await app.getByLabel('Motivo de la corrección',{exact:true}).fill('Checked kilograms');
 await app.getByRole('button',{name:'Confirmar corrección del historial',exact:true}).click();
 await expect(app.getByText('Serie 1: 40 kg × 8',{exact:true})).toBeVisible();
 await app.close();app=await context.newPage();await app.goto('/history');
 await expect(app.getByText('Serie 1: 40 kg × 8',{exact:true})).toBeVisible();
 await expect(app.getByText(/original 45.359237 kg · 45.359237 → 40 kg/)).toBeVisible();
 await readPersistence(app,info);const saved=new DatabaseSync(info.outputPath('canonical.sqlite'));
 expect(saved.prepare('SELECT id,prescribed_snapshot_json,actual_snapshot_json FROM workout_session ORDER BY id').all()).toEqual(originals);
 const correction=JSON.parse(String(saved.prepare("SELECT inputs_json FROM decision_log WHERE decision_type='HISTORY_CORRECTION'").get()!.inputs_json));
 expect(correction.after).toMatchObject({load:'40',loadUnit:'kg'});saved.close();

 const before=await readPersistence(app,info);
 await app.goto('/backup');
 await app.getByLabel('Contraseña portátil del respaldo',{exact:true}).fill('synthetic-load-restore');
 await app.getByRole('button',{name:'Exportar respaldo cifrado',exact:true}).click();
 await expect(app.getByText('Respaldo cifrado y autenticado listo para guardar.')).toBeVisible();
 await app.getByRole('button',{name:'Revisar respaldo antes de restaurar',exact:true}).click();
 await expect(app.getByRole('button',{name:'Confirmar restauración del respaldo',exact:true})).toBeVisible();
 expect(await readPersistence(app,info)).toEqual(before);
 await app.getByRole('button',{name:'Confirmar restauración del respaldo',exact:true}).click();
 await expect(app.getByText('Respaldo restaurado de forma atómica.')).toBeVisible();
 expect(await readPersistence(app,info)).toEqual(before);
 await app.close();app=await context.newPage();await app.goto('/history');
 await expect(app.getByText('Serie 1: 40 kg × 8',{exact:true})).toBeVisible();
 await expect(app.getByText('Serie 4: 22.6796185 kg × 8',{exact:true})).toBeVisible();
 await app.screenshot({path:info.outputPath('restored-load-history.png'),fullPage:true});
 await app.goto('/workout');await expect(app.getByLabel('Carga de la serie 1',{exact:true})).toHaveValue('45.359237');
 expect(await readPersistence(app,info)).toEqual(before);
 const source=new DatabaseSync(info.outputPath('canonical.sqlite'));
 const tables=Object.fromEntries(['user_profile','equipment_profile','active_restriction','training_max','program_template','cycle','training_week','session_plan','session_exercise','workout_session','set_log','symptom_log','session_note','timer_state','progression_proposal','substitution_decision','decision_log','app_setting'].map(t=>[t,source.prepare('SELECT * FROM '+t+' ORDER BY id').all()]));source.close();
 const event=tables.decision_log!.find(r=>r.decision_type==='HISTORY_CORRECTION')!;
 const invalid=JSON.parse(String(event.inputs_json));invalid.after.load=-1;event.inputs_json=JSON.stringify(invalid);
 await app.goto('/backup');
 await app.getByLabel('Documento JSON de respaldo',{exact:true}).fill(JSON.stringify({version:1,exportedAt:'synthetic',tables}));
 await app.getByRole('button',{name:'Confirmar respaldo heredado sin protección',exact:true}).click();
 await app.getByRole('button',{name:'Revisar respaldo antes de restaurar',exact:true}).click();
 await expect(app.getByText('El respaldo contiene cargas o correcciones inválidas. No se cambió ningún dato.')).toBeVisible();
 await expect(app.getByRole('button',{name:'Confirmar restauración del respaldo',exact:true})).toHaveCount(0);
 expect(await readPersistence(app,info)).toEqual(before);
 await app.screenshot({path:info.outputPath('rejected-invalid-history.png'),fullPage:true});

});
