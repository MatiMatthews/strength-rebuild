import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDataServices } from '@/data/repositories/provider';
import { ActionButton, AppText, Panel, Screen } from '@/design-system/v2.2/primitives';
import { AppMasthead } from '@/design-system/v2.2/components';
import type { CycleCompletion } from '@/application/programs/cycle-completion';

const names = { hypertrophy: 'Hipertrofia', strength: 'Fuerza', power: 'Potencia', transition: 'Transición · descarga', reentry: 'Reentrada' };
export default function CycleCompletionRoute() {
  const { programs } = useDataServices();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [preview, setPreview] = useState<CycleCompletion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  const saving = useRef(false);
  useEffect(() => {
    let live = true;
    void programs.getActiveCycleId().then(async id => {
      if (!id) throw new Error('No hay un ciclo activo pendiente de confirmación.');
      const value = await programs.prepareCycleCompletion(id);
      if (live) { setPreview(value); setError(null); }
    }).catch(error => { if (live) setError(error instanceof Error ? error.message : 'No se pudo cargar el ciclo. Reintenta.'); });
    return () => { live = false; };
  }, [programs, revision]);
  const leave = () => router.replace(from === 'plan' ? '/plan' : '/');
  const confirm = async () => {
    if (!preview || saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try { await programs.confirmCycleCompletion(preview); setSaved(true); }
    catch (error) { setError(error instanceof Error && /^(El |La |Hay |Completa |Resuelve |Termina |Se requiere |Este |Ya se )/.test(error.message) ? error.message : 'No se pudo guardar el cambio de ciclo. Tus datos se conservan; vuelve a intentarlo.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Screen testID="cycle-completion-screen">
    <AppMasthead title="SIGUIENTE CICLO" context="Confirma cada cambio de etapa" />
    {saved ? <><AppText accessibilityLiveRegion="polite">Cambio de ciclo guardado.</AppText><ActionButton onPress={leave}>Continuar al plan de entrenamiento</ActionButton></> : <>
      {preview ? <Panel>
        <AppText variant="bodyStrong">Finalizar: {names[preview.currentType]}</AppText>
        <AppText variant="bodyStrong">{preview.nextType ? `Activar: ${names[preview.nextType]}` : 'Finalizar el plan actual'}</AppText>
        <AppText>{preview.nextType === 'transition' ? 'Una semana de descarga: completa sus sesiones y revisión antes de confirmar el siguiente ciclo de carga.' : preview.nextType ? `${preview.nextWeeks} semanas. La preparación de seguridad se mantiene antes de entrenar.` : 'No se creará ni activará otro ciclo automáticamente.'}</AppText>
        <AppText>Se conservan tus sesiones, preferencias y prescripciones originales.</AppText>
        {preview.reason ? <AppText accessibilityLiveRegion="polite">{preview.reason}</AppText> : <ActionButton accessibilityLabel="Confirmar cambio de ciclo" disabled={busy} onPress={() => void confirm()}>{busy ? 'Guardando…' : 'Confirmar cambio de ciclo'}</ActionButton>}
      </Panel> : !error ? <AppText>Cargando ciclo…</AppText> : null}
      {error ? <AppText accessibilityLiveRegion="polite">{error}</AppText> : null}
      {error || preview?.reason ? <ActionButton tone="secondary" disabled={busy} onPress={() => setRevision(value => value + 1)}>Revisar estado actual</ActionButton> : null}
      <ActionButton accessibilityLabel="Cancelar cambio de ciclo" tone="secondary" disabled={busy} onPress={leave}>Cancelar y volver a {from === 'plan' ? 'Plan' : 'Hoy'}</ActionButton>
    </>}
  </Screen>;
}
