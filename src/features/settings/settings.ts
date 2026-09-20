import { generatePrescription, InsufficientWorkoutError } from '../../domain/prescriptions/generator';
import { CatalogConstraintError, CatalogRequirementError } from '../../domain/prescriptions/catalog-requirements';

export type UnitSystem = 'kg' | 'lb';
export type RequirementKind = 'EXACT' | 'PATTERN' | 'CAPABILITY';

export interface TrainingSettings {
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  demoProfileId?: string;
  units: UnitSystem;
  increments: number[];
  equipment: string[];
  schedule: number[];
  requirements: { kind: RequirementKind; value: string }[];
  restrictions: string[];
  profileUnit?: UnitSystem;
  referenceSources?: Partial<Record<ReferenceKey, 'user' | 'unknown' | 'legacy'>>;
  profile?: {
    benchPressReference?: number;
    deadliftReference?: number;
    backSquatReference?: number;
    strictPullUpCapacity?: number;
  };
}

export type ReferenceKey = keyof NonNullable<TrainingSettings['profile']>;

export const SAFE_DEMO_PROFILE_ID = 'synthetic-strength-demo-v1';

export const defaultSettings: TrainingSettings = {
  units: 'kg',
  increments: [1.25, 2.5, 5],
  equipment: ['Barra', 'Mancuernas', 'Banco'],
  schedule: [1, 3, 5],
  requirements: [
    { kind: 'EXACT', value: 'barbell-bench-press' },
    { kind: 'PATTERN', value: 'horizontal-push' },
    { kind: 'CAPABILITY', value: 'power' },
  ],
  restrictions: [],
  profile: {},
  profileUnit: 'kg',
  referenceSources: { benchPressReference: 'unknown', deadliftReference: 'unknown', backSquatReference: 'unknown', strictPullUpCapacity: 'unknown' },
};

/** Fresh personal references stay unknown; persisted installs pass through untouched. */
export function resolveTrainingSettings(persisted: TrainingSettings | null | undefined): TrainingSettings {
  return persisted ?? defaultSettings;
}

export function validateSettings(settings: TrainingSettings): { success: true } | { success: false; message: string; requirementIndex?: number } {
  if (settings.skillLevel && !['beginner', 'intermediate', 'advanced'].includes(settings.skillLevel)) return { success: false, message: 'Selecciona un nivel técnico válido para las alternativas.' };
  if (!settings.increments.length || settings.increments.some((value) => !Number.isFinite(value) || value <= 0)) return { success: false, message: 'Añade al menos un incremento positivo.' };
  if (!settings.equipment.length) return { success: false, message: 'Selecciona al menos un equipo disponible.' };
  if (settings.schedule.length !== 3 || new Set(settings.schedule).size !== 3 || settings.schedule.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return { success: false, message: 'Selecciona exactamente tres días distintos de entrenamiento.' };
  if (!settings.requirements.length) return { success: false, message: 'Completa al menos un requisito.' };
  if (settings.profileUnit && !['kg', 'lb'].includes(settings.profileUnit)) return { success: false, message: 'La unidad de las referencias debe ser kg o lb.' };
  if (settings.profile?.strictPullUpCapacity !== undefined && !Number.isInteger(settings.profile.strictPullUpCapacity)) return { success: false, message: 'Las dominadas deben ser un número entero positivo.' };
  if (settings.profile && Object.values(settings.profile).some((value) => !Number.isFinite(value) || value <= 0)) return { success: false, message: 'Las referencias de fuerza deben ser positivas.' };
  try {
    generatePrescription({ id: 'settings-validation', type: 'strength', weeks: 1, equipment: settings.equipment, requirements: settings.requirements, restrictions: settings.restrictions });
  } catch (error) {
    if (error instanceof CatalogConstraintError || error instanceof InsufficientWorkoutError) return { success: false, message: error.message };
    if (error instanceof CatalogRequirementError) return { success: false, message: error.message, requirementIndex: error.requirementIndex };
    throw error;
  }
  return { success: true };
}

export interface SettingsStore {
  load(): Promise<TrainingSettings>;
  save(settings: TrainingSettings, baseline?: TrainingSettings): Promise<void>;
}

/** Legacy references retain their stored unit; display preferences never reinterpret them. */
export function planningProfile(settings: TrainingSettings) {
  const sourceUnit = settings.profileUnit ?? settings.units;
  const factor = sourceUnit === settings.units ? 1 : sourceUnit === 'lb' ? 0.45359237 : 1 / 0.45359237;
  const profile = Object.fromEntries(Object.entries(settings.profile ?? {}).map(([key, value]) =>
    [key, key === 'strictPullUpCapacity' ? value : value * factor]));
  return { ...profile, units: settings.units, availableIncrement: Math.min(...settings.increments) } as NonNullable<Parameters<typeof generatePrescription>[0]['profile']>;
}
