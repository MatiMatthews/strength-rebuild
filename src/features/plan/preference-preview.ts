import { generatePrescription, type CyclePrescriptionType } from '@/domain/prescriptions/generator';
import { planningProfile, validateSettings, type TrainingSettings } from '@/features/settings/settings';

/** A read-only proposal; active prescriptions remain their original snapshots. */
export function previewPreferences(settings: TrainingSettings, type: CyclePrescriptionType) {
  const validation = validateSettings(settings);
  if (!validation.success) throw new Error(validation.message);
  return generatePrescription({
    id: 'preferences-preview', type, weeks: 1, profile: planningProfile(settings),
    schedule: [...settings.schedule], equipment: [...settings.equipment],
    requirements: settings.requirements.map(requirement => ({ ...requirement })),
    restrictions: [...settings.restrictions],
  });
}
