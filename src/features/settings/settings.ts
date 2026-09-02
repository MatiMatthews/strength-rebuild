export type UnitSystem = 'kg' | 'lb';
export type RequirementKind = 'EXACT' | 'PATTERN' | 'CAPABILITY';

export interface TrainingSettings {
  demoProfileId?: string;
  units: UnitSystem;
  increments: number[];
  equipment: string[];
  schedule: number[];
  requirements: { kind: RequirementKind; value: string }[];
  restrictions: string[];
  profile?: {
    benchPressReference: number;
    deadliftReference: number;
    backSquatReference: number;
    strictPullUpCapacity: number;
  };
}

export const SAFE_DEMO_PROFILE_ID = 'synthetic-strength-demo-v1';

export const defaultSettings: TrainingSettings = {
  demoProfileId: SAFE_DEMO_PROFILE_ID,
  units: 'kg',
  increments: [1.25, 2.5, 5],
  equipment: ['Barra', 'Mancuernas', 'Banco'],
  schedule: [1, 3, 5],
  requirements: [
    { kind: 'EXACT', value: 'Sentadilla con barra' },
    { kind: 'PATTERN', value: 'Empuje horizontal' },
    { kind: 'CAPABILITY', value: 'Potencia de tren inferior' },
  ],
  restrictions: [],
  profile: { benchPressReference: 60, deadliftReference: 100, backSquatReference: 80, strictPullUpCapacity: 5 },
};

/** Fresh installs receive the synthetic demo profile; persisted installs pass through untouched. */
export function resolveTrainingSettings(persisted: TrainingSettings | null | undefined): TrainingSettings {
  return persisted ?? defaultSettings;
}

export function validateSettings(settings: TrainingSettings): { success: true } | { success: false; message: string } {
  if (!settings.increments.length || settings.increments.some((value) => !Number.isFinite(value) || value <= 0)) return { success: false, message: 'Añade al menos un incremento positivo.' };
  if (!settings.equipment.length) return { success: false, message: 'Selecciona al menos un equipo disponible.' };
  if (!settings.schedule.length || settings.schedule.some((day) => day < 1 || day > 7)) return { success: false, message: 'Selecciona al menos un día válido.' };
  if (!settings.requirements.length || settings.requirements.some(({ value }) => !value.trim())) return { success: false, message: 'Completa al menos un requisito.' };
  if (settings.profile && Object.values(settings.profile).some((value) => !Number.isFinite(value) || value <= 0)) return { success: false, message: 'Las referencias de fuerza deben ser positivas.' };
  return { success: true };
}

export interface SettingsStore {
  load(): Promise<TrainingSettings>;
  save(settings: TrainingSettings): Promise<void>;
}
