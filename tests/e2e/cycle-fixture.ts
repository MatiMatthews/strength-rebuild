import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readPersistence } from './persistence';

export async function changeCycleFixture(page: Page, context: BrowserContext, info: TestInfo, change: (db: DatabaseSync) => void) {
  await readPersistence(page, info); await page.close();
  const db = new DatabaseSync(info.outputPath('canonical.sqlite'));
  try { change(db); } finally { db.close(); }
  const fixture = await context.newPage();
  await fixture.route('**/__synthetic_fixture', route => route.fulfill({contentType:'text/html',body:'<title>Synthetic fixture</title>'}));
  await fixture.goto('/__synthetic_fixture');
  await fixture.evaluate(async bytes => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('expo-sqlite');
    const handles = directory as FileSystemDirectoryHandle & {values(): AsyncIterable<FileSystemFileHandle>};
    let changed=0;
    for await (const handle of handles.values()) {
      if(handle.kind!=='file') continue;
      const data=new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if(!new TextDecoder().decode(data.slice(0,512)).split('\0')[0]?.endsWith('/strength-rebuild-v2.db')) continue;
      const writer=await handle.createWritable(); await writer.write(data.slice(0,4096)); await writer.write(new Uint8Array(bytes)); await writer.close(); changed++;
    }
    if(changed!==1) throw new Error('Expected exactly one synthetic database');
  },Array.from(readFileSync(info.outputPath('canonical.sqlite'))));
  await fixture.close();
  return context.newPage();
}

export function finalWeekFixture(db: DatabaseSync) {
  const current=db.prepare("SELECT id FROM cycle WHERE kind='hypertrophy' ORDER BY rowid LIMIT 1").get()!.id;
  db.prepare("UPDATE cycle SET status='ACTIVE' WHERE id=?").run(current!);
  db.prepare("UPDATE training_week SET status='COMPLETED' WHERE cycle_id=?").run(current!);
  db.prepare("UPDATE session_plan SET status='COMPLETED' WHERE training_week_id IN (SELECT id FROM training_week WHERE cycle_id=?)").run(current!);
  db.prepare("UPDATE training_week SET status='REVIEW' WHERE cycle_id=? AND week_index=(SELECT MAX(week_index) FROM training_week WHERE cycle_id=?)").run(current!,current!);
  // Accelerated transition sessions still use real workout/review consumers.
  for(const row of db.prepare("SELECT s.id,s.day_index FROM session_plan s JOIN training_week w ON w.id=s.training_week_id JOIN cycle c ON c.id=w.cycle_id WHERE c.kind='transition'").all()) {
    const exercise={exerciseId:'seated-leg-curl',requirement:'EXACT',calculatedLoad:null,target:{sets:1,reps:{min:5,max:10},rir:{min:4,max:5},loadPercent:null},qualityStops:['NO_FAILURE','NO_PERSONAL_RECORD']};
    db.prepare('UPDATE session_plan SET snapshot_json=? WHERE id=?').run(JSON.stringify({dayIndex:row.day_index,exercises:[exercise]}),row.id!);
  }
}
