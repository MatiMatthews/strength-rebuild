import type { ReferenceKey, TrainingSettings } from './settings';

export const referenceLabels: Record<ReferenceKey, string> = {
  benchPressReference: 'Press banca', deadliftReference: 'Peso muerto',
  backSquatReference: 'Sentadilla', strictPullUpCapacity: 'Dominadas estrictas',
};
export const referenceKeys = Object.keys(referenceLabels) as ReferenceKey[];
export type ReferenceDraft = Record<ReferenceKey, { known: boolean; text: string; edited: boolean }>;
export function referenceDraft(settings: TrainingSettings): ReferenceDraft {
  return Object.fromEntries(referenceKeys.map(key => [key, {
    known: settings.profile?.[key] !== undefined,
    text: settings.profile?.[key] === undefined ? '' : String(settings.profile[key]), edited: false,
  }])) as ReferenceDraft;
}
export function commitReferences(settings: TrainingSettings, draft: ReferenceDraft): TrainingSettings {
  if (!referenceKeys.some(key => draft[key].edited)) return settings;
  const profile = { ...settings.profile };
  const referenceSources = { ...settings.referenceSources };
  for (const key of referenceKeys) {
    const field = draft[key];
    if (!field.edited) { referenceSources[key] ??= profile[key] === undefined ? 'unknown' : 'legacy'; continue; }
    if (!field.known) { delete profile[key]; referenceSources[key] = 'unknown'; continue; }
    const value = Number(field.text.trim().replace(',', '.'));
    if (!/^\d+(?:[.,]\d+)?$/.test(field.text.trim()) || !Number.isFinite(value) || value <= 0 || (key === 'strictPullUpCapacity' && !Number.isInteger(value))) {
      throw new Error(`${referenceLabels[key]}: escribe ${key === 'strictPullUpCapacity' ? 'un número entero positivo' : 'un número positivo completo (por ejemplo, 60,5)'} o elige No lo sé.`);
    }
    profile[key] = value; referenceSources[key] = 'user';
  }
  return { ...settings, profile, referenceSources };
}
