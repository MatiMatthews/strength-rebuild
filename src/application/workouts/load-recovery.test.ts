import { recoverWorkoutLoads } from './load-recovery';
import type { WorkoutDraft, WorkoutSetDraft } from './workout-service';
import type { TodayData } from '../programs/program-service';
const set: WorkoutSetDraft={load:'100',reps:'8',rir:'2',technique:'Limpia',pain:0,notes:'',completed:true,skipped:false,disposition:'COMPLETED'};
const original:WorkoutDraft={id:'original',exercises:[{exerciseId:'barbell-bench-press',originalExerciseId:'barbell-bench-press',requirement:'EXACT',sets:[set]}],safetyModifications:[]};
const prescribed={dayIndex:1,exercises:[{exerciseId:'barbell-bench-press',calculatedLoad:100,loadProvenance:'bench press reference 200 lb; training max reference; 50%; rounded to 5',target:{sets:1}}]} as unknown as TodayData['session'];
const read=(draft=original,source=prescribed)=>recoverWorkoutLoads(draft,source).exercises[0]!.sets[0]!;
it('gives explicit units precedence, preserves blanks/zero and projects idempotently',()=>{
 expect(read()).toMatchObject({load:'45.359237',loadUnit:'kg'});
 for(const [load,loadUnit,expected] of [['100','kg','100'],['50','lb','22.6796185'],['','lb',''],['0','lb','0']] as const){
  const draft=structuredClone(original);draft.exercises[0]!.sets[0]={...set,load,loadUnit};
  expect(read(draft).load).toBe(expected);
  expect(recoverWorkoutLoads(recoverWorkoutLoads(draft,prescribed),prescribed)).toEqual(recoverWorkoutLoads(draft,prescribed));
 }
 expect(original.exercises[0]!.sets[0]).toEqual(set);
});
it('never infers units for edited loads, replacements, duplicate identities or mismatched sources',()=>{
 for(const change of [
  (d:WorkoutDraft)=>{d.exercises[0]!.sets[0]!.load='80';},
  (d:WorkoutDraft)=>{d.exercises[0]!.originalExerciseId='other';},
  (d:WorkoutDraft)=>{d.exercises.push(structuredClone(d.exercises[0]!));},
  (d:WorkoutDraft)=>{d.exercises[0]!.exerciseId='other';},
 ]){const draft=structuredClone(original);change(draft);expect(read(draft).load).toBe(draft.exercises[0]!.sets[0]!.load);}
 const source=structuredClone(prescribed);(source.exercises as unknown[]).push(source.exercises[0]);expect(read(original,source).load).toBe('100');
 const edited=structuredClone(prescribed);Object.assign(edited.exercises[0]!,{loadProvenance:'bench press reference 100 lb; training max reference; 50%; rounded to 5'});expect(read(original,edited).load).toBe('100');
 expect(recoverWorkoutLoads(original).exercises[0]!.sets[0]!.load).toBe('100');
});
it.each(['-1','Infinity','NaN','0x10','1e4','text'])('rejects malformed original load %s without mutation',load=>{
 const draft=structuredClone(original);draft.exercises[0]!.sets[0]!.load=load;const before=JSON.stringify(draft);
 expect(()=>read(draft)).toThrow();expect(JSON.stringify(draft)).toBe(before);
});
it('rejects unknown explicit units instead of silently applying kg',()=>{
 const draft=structuredClone(original);Object.assign(draft.exercises[0]!.sets[0]!,{loadUnit:'stone'});expect(()=>read(draft)).toThrow('unidad');
});
it('restores deleted sets in the same canonical unit as resumed sets',()=>{
 const draft=structuredClone(original);draft.setDeletions=[{id:1,exerciseIndex:0,exerciseId:'barbell-bench-press',setIndex:0,set}];
 expect(recoverWorkoutLoads(draft,prescribed).setDeletions![0]!.set.load).toBe('45.359237');
 draft.exercises.push(structuredClone(draft.exercises[0]!));
 expect(recoverWorkoutLoads(draft,prescribed).setDeletions![0]!.set.load).toBe('100');
});

it('normalizes the editing unit even when a typed legacy load is empty',()=>{
 const draft=structuredClone(original);draft.exercises[0]!.sets[0]={...set,load:'',loadUnit:'lb'};
 const projected=recoverWorkoutLoads(draft,prescribed);
 projected.exercises[0]!.sets[0]!.load='50';
 expect(read(projected)).toMatchObject({load:'50',loadUnit:'kg'});
});
it('matches repeated generated movements by their unique block role',()=>{
 const draft=structuredClone(original);draft.exercises[0]!.blockRole='primary';
 draft.exercises.push({...structuredClone(draft.exercises[0]!),blockRole:'accessory'});
 const source={...prescribed,blocks:[{role:'primary',exercises:[prescribed.exercises[0]!]},{role:'accessory',exercises:[{...prescribed.exercises[0]!,calculatedLoad:80,loadProvenance:'bench press reference 200 lb; training max reference; 40%; rounded to 5'}]}]} as TodayData['session'];
 const result=recoverWorkoutLoads(draft,source);
 expect(result.exercises.map(e=>e.sets[0]!.load)).toEqual(['45.359237','100']);
});
