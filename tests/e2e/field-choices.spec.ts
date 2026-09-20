import { test, expect } from '@playwright/test';
import { fieldContrast } from './field-contrast';
import { navigationContrast } from './navigation-contrast';
import { readPersistence } from './persistence';
for(const colorScheme of ['light','dark'] as const) test(`${colorScheme} fields and choices preserve drafts, validate, cancel, save and reopen`,async({page,context},info)=>{
  await page.emulateMedia({colorScheme}); await page.goto('/settings');
  const input=page.getByLabel('Incremento 1',{exact:true}); await expect(input).toHaveValue('1.25');
  await fieldContrast(input,info,'normal-input');
  const before=await readPersistence(page,info);
  await input.fill('3,'); await input.focus();
  await page.emulateMedia({colorScheme:colorScheme==='light'?'dark':'light'});
  await expect(input).toBeFocused();await expect(input).toHaveValue('3,');await fieldContrast(input,info,'focused-theme-change');
  const save=page.getByRole('button',{name:'Guardar configuración local',exact:true});await save.click();
  expect(await readPersistence(page,info)).toEqual(before);
  await page.getByRole('button',{name:'Cancelar cambios de configuración',exact:true}).click();await expect(input).toHaveValue('1.25');expect(await readPersistence(page,info)).toEqual(before);
  for(const radio of await page.getByRole('radio').all()) {await fieldContrast(radio,info,'choice');await navigationContrast(radio,info,'choice-label');}
  const known=page.getByRole('radio',{name:'Conozco mi referencia de Press banca',exact:true});await known.click();await known.click();await known.hover();await page.mouse.down();await fieldContrast(known,info,'pressed-choice');await navigationContrast(known,info,'pressed-choice-label');await page.mouse.up();await expect(known).toHaveAttribute('aria-checked','true');
  const reference=page.getByLabel('Referencia de Press banca',{exact:true});await reference.fill('60,5');await fieldContrast(reference,info,'reference');
  await input.fill('3,75');await save.click();await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const saved=await readPersistence(page,info); const settings=JSON.parse(String(saved.settings.find(r=>r.key==='training-settings')!.value_json));expect(settings.increments).toEqual([3.75,2.5,5]);expect(settings.profile.benchPressReference).toBe(60.5);expect(saved.workouts).toEqual(before.workouts);
  const original=await input.evaluate(el=>{const original=(el as HTMLElement).style.borderColor;(el as HTMLElement).style.borderColor=matchMedia('(prefers-color-scheme: dark)').matches?'#60686D':'#C9CECA';return original;});
  await expect(fieldContrast(input,info,'boundary-mutation')).rejects.toThrow();await input.evaluate((el,c)=>{(el as HTMLElement).style.borderColor=c;},original);
  await page.locator('body').evaluate(el=>{el.style.zoom='1.4';});await input.scrollIntoViewIfNeeded();await fieldContrast(input,info,'large-input');await page.screenshot({path:info.outputPath('fields.png')});
  await page.close();const reopened=await context.newPage();await reopened.emulateMedia({colorScheme});await reopened.goto('/settings');await expect(reopened.getByLabel('Incremento 1',{exact:true})).toHaveValue('3.75');await expect(reopened.getByLabel('Referencia de Press banca',{exact:true})).toHaveValue('60.5');expect(await readPersistence(reopened,info)).toEqual(saved);
});
for(const colorScheme of ['light','dark'] as const) test(`${colorScheme} workout, preparation and sheet fields stay readable and cancel without writes`,async({page},info)=>{
  await page.emulateMedia({colorScheme});
  const {startSyntheticWorkout}=await import('./setup');await startSyntheticWorkout(page,async()=>{ for(const radio of await page.getByRole('radio').all()) { await fieldContrast(radio,info,'preparation-choice');await navigationContrast(radio,info,'preparation-label'); } });
  await expect(page.getByRole('button',{name:'Cerrar Preparación de hoy',exact:true})).toHaveCount(0);
  for(const input of await page.getByRole('textbox').all()) { await input.scrollIntoViewIfNeeded(); await fieldContrast(input,info,'workout-input'); }
  const toggle=page.getByRole('switch',{name:'Descanso automático al completar una serie',exact:true});
  for(const checked of [false,true]) {
    if(checked) await toggle.click();
    await expect(toggle).toBeChecked({checked});
    const contrast=await toggle.evaluate(input=>{
      const root=input.parentElement!;
      const track=root.children[0]!,thumb=root.children[1]!;
      let surface=root.parentElement!;
      while(getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)') surface=surface.parentElement!;
      const luminance=(color:string)=>{const rgb=color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;};
      const ratio=(a:Element,b:Element)=>{const x=luminance(getComputedStyle(a).backgroundColor),y=luminance(getComputedStyle(b).backgroundColor);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
      return {track:ratio(track,surface),thumb:ratio(thumb,track)};
    });
    expect(contrast.track).toBeGreaterThanOrEqual(3);expect(contrast.thumb).toBeGreaterThanOrEqual(3);
  }
  await toggle.click();await expect(toggle).not.toBeChecked();
  for(const radio of await page.getByRole('radio').all()) {await fieldContrast(radio,info,'workout-choice');await navigationContrast(radio,info,'workout-choice-label');}
  await page.getByRole('radio',{name:'Regular, serie 1',exact:true}).click();
  await expect.poll(async()=>{const state=await readPersistence(page,info);return JSON.parse(String(state.workouts[0]!.actual_snapshot_json)).exercises[0].sets[0].technique;}).toBe('Regular');
  await page.reload();await expect(page.getByRole('radio',{name:'Regular, serie 1',exact:true})).toHaveAttribute('aria-checked','true');
  const before=await readPersistence(page,info);
  await page.getByRole('button',{name:'Omitir serie 1',exact:true}).click();const reason=page.getByLabel('Motivo para omitir la serie 1',{exact:true});await reason.fill('Cambio sin guardar');await fieldContrast(reason,info,'omission-draft');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();expect(await readPersistence(page,info)).toEqual(before);
  await page.goto('/plan');await fieldContrast(page.getByLabel('Semanas de hipertrofia',{exact:true}),info,'plan-field');
  await page.goto('/backup');for(const input of await page.locator('input,textarea').all())await fieldContrast(input,info,'backup-field');
});
