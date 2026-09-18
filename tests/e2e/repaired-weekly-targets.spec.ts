import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, copyFileSync } from 'node:fs';
import { readPersistence } from './persistence';

for(const [outcome,choice] of [['successful','ACCEPTED'],['successful','KEPT'],['successful','REJECTED'],['missed','ACCEPTED']]) test(`repaired weekly targets: ${outcome} ${choice} preserves originals and opens the next workout`,async({page,context},info)=>{
 test.setTimeout(150_000);
 await page.goto('/plan');
 await page.getByRole('button',{name:'Crear vista previa del ciclo',exact:true}).click();
 await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
 await readPersistence(page,info);await page.close();
 const db=new DatabaseSync(info.outputPath('canonical.sqlite'));
 const cycle=db.prepare("SELECT id FROM cycle WHERE kind='hypertrophy'").get()!;
 db.prepare("UPDATE cycle SET status='ACTIVE' WHERE id=?").run(cycle.id!);
 for(const row of db.prepare('SELECT s.id,s.day_index,w.week_index FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.cycle_id=?').all(cycle.id!)) {
   const exercises=['barbell-bench-press','seated-leg-curl'].map(exerciseId=>({exerciseId,requirement:'PATTERN',calculatedLoad:40,target:{sets:1,reps:{min:6,max:8},rir:{min:2,max:3},loadPercent:null},qualityStops:[]}));
   if(row.week_index===2 && row.day_index===1) exercises.push({...exercises[0]!,exerciseId:'unknown-legacy',calculatedLoad:999});
   db.prepare('UPDATE session_plan SET snapshot_json=? WHERE id=?').run(JSON.stringify({dayIndex:row.day_index,exercises}),row.id!);
 }
 db.close();
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

 const app=await context.newPage();await app.goto('/plan');
 await app.getByRole('button',{name:'Revisar referencias de semana 2, sesión 1',exact:true}).click();
 await app.getByLabel('Buscar ejercicio compatible',{exact:true}).fill('Press hombro sentado');
 await app.getByRole('button',{name:'Ver propuesta Press hombro sentado para unknown-legacy',exact:true}).click();
 await app.getByRole('button',{name:'Reparar esta referencia',exact:true}).click();
 await app.getByRole('button',{name:'Confirmar reparación',exact:true}).click();
 await expect(app.getByText('Referencia reparada. Se conserva el original y tu elección queda registrada.')).toBeVisible();
 await app.goto('/');
 for(let day=0;day<3;day++) {
  await app.goto('/');
  await app.getByRole('button',{name:'Revisar preparación para entrenar',exact:true}).click();
  await app.getByLabel('Dolor de 0 a 2, estable',{exact:true}).click();
  await app.getByRole('button',{name:'Confirmar preparación',exact:true}).click();
  await expect(app.getByTestId('workout-screen')).toBeVisible();
  for(let e=0;e<2;e++) {
   await app.getByLabel('Carga de la serie 1',{exact:true}).fill('40');
   await app.getByLabel('Repeticiones de la serie 1',{exact:true}).fill(outcome==='missed' && day===2 && e===0?'1':'6');
   await app.getByRole('button',{name:'Completar serie 1',exact:true}).click();
   if(e===0) await app.getByRole('button',{name:'Siguiente ejercicio',exact:true}).click();
  }
  await app.getByRole('button',{name:'Revisar y terminar entrenamiento',exact:true}).click();
  await app.getByRole('button',{name:'Confirmar fin de entrenamiento',exact:true}).click();
  await expect(app.getByTestId('finish-review')).not.toBeVisible();
 }
 await app.goto('/');await app.getByRole('button',{name:'Abrir revisión semanal',exact:true}).click();
 await readPersistence(app,info);copyFileSync(info.outputPath('canonical.sqlite'),info.outputPath('before-proposal.sqlite'));
 if(outcome==='missed') await app.getByRole('radio',{name:'Incompleta',exact:true}).click();
 await app.getByRole('button',{name:'Crear propuesta semanal',exact:true}).click();
 await expect(app.getByText(outcome==='missed'?'1 × 6 → 1 × 6 repeticiones · 40 → 38 kg':'1 × 6 → 1 × 7 repeticiones · 40 → 40 kg',{exact:true})).toHaveCount(outcome==='missed'?3:6);
 await app.screenshot({path:info.outputPath('weekly-target-preview.png'),fullPage:true});
 const before=await readPersistence(app,info);
 copyFileSync(info.outputPath('canonical.sqlite'),info.outputPath('pending-targets.sqlite'));
 await app.reload();
 await expect(app.getByText(outcome==='missed'?'1 × 6 → 1 × 6 repeticiones · 40 → 38 kg':'1 × 6 → 1 × 7 repeticiones · 40 → 40 kg',{exact:true})).toHaveCount(outcome==='missed'?3:6);
 await app.getByRole('button',{name:choice==='ACCEPTED'?'Aceptar propuesta semanal':choice==='KEPT'?'Mantener plan semanal':'Rechazar propuesta semanal',exact:true}).click();
 await expect(app.getByText('No hay revisiones semanales pendientes.',{exact:false})).toBeVisible();
 await app.reload();
 const after=await readPersistence(app,info);
 expect(after.sessionSnapshots).toEqual(before.sessionSnapshots);expect(after.workouts).toEqual(before.workouts);
 const saved=new DatabaseSync(info.outputPath('canonical.sqlite'),{readOnly:true});
 expect(saved.prepare("SELECT * FROM decision_log WHERE decision_type='WEEKLY_TARGETS'").all()).toHaveLength(choice==='ACCEPTED'?1:0);saved.close();
 if(choice==='ACCEPTED') {
  await app.goto('/backup');
  await app.getByLabel('Contraseña portátil del respaldo',{exact:true}).fill('synthetic composed backup');
  await app.getByRole('button',{name:'Exportar respaldo cifrado',exact:true}).click();
  await expect(app.getByText('Respaldo cifrado y autenticado listo para guardar.')).toBeVisible();
  await app.getByRole('button',{name:'Revisar respaldo antes de restaurar',exact:true}).click();
  await app.getByRole('button',{name:'Confirmar restauración del respaldo',exact:true}).click();
  await expect(app.getByText('Respaldo restaurado de forma atómica.')).toBeVisible();
  expect(await readPersistence(app,info)).toEqual(after);
  await app.reload();expect(await readPersistence(app,info)).toEqual(after);
 }
 await app.goto('/');
 await app.getByRole('button',{name:'Revisar preparación para entrenar',exact:true}).click();
 await app.getByLabel('Dolor de 0 a 2, estable',{exact:true}).click();
 await app.getByRole('button',{name:'Confirmar preparación',exact:true}).click();
 await expect(app.getByLabel('Repeticiones de la serie 1',{exact:true})).toHaveValue(choice==='ACCEPTED' && outcome==='successful'?'7':'6');
 const final=await readPersistence(app,info);const active=final.workouts.find(r=>r.status==='IN_PROGRESS')!;
 expect(final.plannedSessions.find(s=>s.id===active.session_plan_id)?.week_index).toBe(2);
 expect(JSON.parse(String(active.prescribed_snapshot_json)).exercises.map((e:{target:{reps:{min:number}}})=>e.target.reps.min)).toEqual(choice==='ACCEPTED' && outcome==='successful'?[7,7,6]:[6,6,6]);
 const prescribed=JSON.parse(String(active.prescribed_snapshot_json));expect(prescribed.exercises[0].calculatedLoad).toBe(choice==='ACCEPTED' && outcome==='missed'?38:40);expect(prescribed.exercises[2].exerciseId).toBe('seated-dumbbell-press');expect(prescribed.exercises[2].calculatedLoad).toBeUndefined();
 await app.screenshot({path:info.outputPath('next-week-workout.png'),fullPage:true});
});
