import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readPersistence } from './persistence';
import { startSyntheticWorkout } from './setup';

test('recovers pounds in history and an active workout without rewriting originals on reopen', async ({page,context},info)=>{
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
 historical.exercises[0].sets=[historical.exercises[0].sets[0],{...historical.exercises[0].sets[0],load:'80'}, {...historical.exercises[0].sets[0],load:'100',loadUnit:'kg'}];
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
 await app.screenshot({path:info.outputPath('recovered-load-history.png'),fullPage:true});
});
