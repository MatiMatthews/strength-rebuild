import type { WorkoutSetDraft } from './workout-service';

export type LoadUnit = 'kg' | 'lb';
export interface LoadEntry { value: string; unit: LoadUnit }
export const POUNDS_TO_KG = 0.45359237;
export function enteredLoad(value: string, unit: LoadUnit): Pick<WorkoutSetDraft, 'load' | 'loadUnit' | 'loadEntry'> {
  if (!['kg', 'lb'].includes(unit) || (value !== '' && !/^\d+(?:[.,]\d*)?$/.test(value))) throw new Error('Escribe una carga válida, sin valores negativos.');
  const amount = Number(value.replace(',', '.'));
  const kg = amount * (unit === 'lb' ? POUNDS_TO_KG : 1);
  if (!Number.isFinite(kg)) throw new Error('La carga debe ser finita.');
  return { load: value === '' ? '' : String(Number(kg.toFixed(8))), loadUnit: 'kg', loadEntry: { value, unit } };
}
export function displayLoad(set: Pick<WorkoutSetDraft, 'load' | 'loadUnit' | 'loadEntry'>, unit: LoadUnit): string {
  if (set.loadEntry?.unit === unit && enteredLoad(set.loadEntry.value, unit).load === set.load) return set.loadEntry.value;
  if (!set.load.trim()) return '';
  const kg = Number(set.load.replace(',', '.')) * (set.loadUnit === 'lb' ? POUNDS_TO_KG : 1);
  return String(Number((kg / (unit === 'lb' ? POUNDS_TO_KG : 1)).toFixed(8)));
}
export function validateLoadEntry(set: WorkoutSetDraft): void {
  if (!set.loadEntry) return;
  const expected = enteredLoad(set.loadEntry.value, set.loadEntry.unit);
  if (set.loadUnit !== 'kg' || expected.load !== set.load) throw new Error('La carga y su unidad de entrada no coinciden. Se conserva el registro guardado.');
}
