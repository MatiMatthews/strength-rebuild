import { useState } from 'react';

import type { InvalidSessionReference, ProgramService, TodayData } from '@/application/programs/program-service';
import { exerciseCatalog } from '@/data/seeds/exercises';
import { ActionButton, AppText, FeedbackBanner, Panel, TextField } from '@/design-system/v2.2/primitives';
import { catalogCompatibility } from '@/domain/prescriptions/catalog-requirements';
import type { TrainingSettings } from '@/features/settings/settings';

/** Local exploration only; committing a repair requires a separate guarded transaction. */
export function LegacyReferencePreview({ reference, programs, settings, onCancel }: {
  reference: InvalidSessionReference;
  programs: Pick<ProgramService, 'previewLegacyReplacement'>;
  settings: TrainingSettings;
  onCancel(): void;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ original: string; exercise: TodayData['session']['exercises'][number] } | null>(null);
  const constraints = { equipment: settings.equipment, restrictions: settings.restrictions };
  const compatible = catalogCompatibility({ id: 'preview', type: 'reentry', weeks: 1, ...constraints });
  const choices = exerciseCatalog.filter((exercise) => exercise.pattern !== 'review' && compatible(exercise)
    && exercise.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const choose = async (original: string, replacement: string) => {
    if (busy) return;
    setBusy(true); setError(null); setPreview(null);
    try { setPreview({ original, exercise: await programs.previewLegacyReplacement(reference.sessionPlanId, original, replacement, constraints) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo preparar la propuesta. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };
  return <Panel>
    <AppText variant="bodyStrong">Revisar sesión {reference.dayIndex} · semana {reference.weekIndex}</AppText>
    <AppText>No sabemos qué movimiento representaba la referencia original. Elige un ejercicio para explorar su propuesta; todavía no se guarda ningún cambio.</AppText>
    <TextField label="Buscar ejercicio compatible" value={query} onChangeText={setQuery} />
    {!preview ? reference.invalidExerciseIds.map((original) => <Panel key={original}>
      <AppText variant="bodyStrong">Referencia desconocida: {original}</AppText>
      {choices.map((exercise) => <ActionButton key={exercise.id} accessibilityLabel={`Ver propuesta ${exercise.name} para ${original}`} disabled={busy} onPress={() => choose(original, exercise.id)} tone="secondary">{exercise.name}</ActionButton>)}
    </Panel>) : null}
    {choices.length === 0 ? <AppText>No hay opciones compatibles con la búsqueda, tu equipo y restricciones. Revisa la búsqueda o la configuración del plan.</AppText> : null}
    {busy ? <AppText>Preparando propuesta…</AppText> : null}
    {error ? <FeedbackBanner message={error} tone="danger" /> : null}
    {preview ? <Panel>
      <AppText variant="bodyStrong">Propuesta: {exerciseCatalog.find((exercise) => exercise.id === preview.exercise.exerciseId)?.name}</AppText>
      <AppText>Para la referencia: {preview.original}</AppText>
      <AppText>{preview.exercise.target.sets} series · {preview.exercise.target.reps.min}–{preview.exercise.target.reps.max} repeticiones · RIR {preview.exercise.target.rir.min}–{preview.exercise.target.rir.max}</AppText>
      <AppText>Carga por definir; no se transfiere la carga del ejercicio desconocido.</AppText>
      <AppText>Solo vista previa. Tu sesión original sigue intacta.</AppText>
      <ActionButton onPress={() => setPreview(null)} tone="secondary">Elegir otra propuesta</ActionButton>
    </Panel> : null}
    <ActionButton accessibilityLabel="Cancelar revisión de referencias" onPress={onCancel} tone="secondary">Cancelar</ActionButton>
  </Panel>;
}
