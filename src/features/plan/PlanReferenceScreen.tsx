import { InsufficientWorkoutError } from '@/domain/prescriptions/generator';
import { CatalogRequirementError } from '@/domain/prescriptions/catalog-requirements';
import { exerciseCatalog } from '@/data/seeds/exercises';

import { ChevronDown } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, AppText, FeedbackBanner, Panel, Screen, TextField } from '@/design-system/v2.2/primitives';
import { AppMasthead, OperationalSection, PhaseBand } from '@/design-system/v2.2/components';
import { palette, spacing , palette as athletePalette, spacing as athleteSpacing, typography as athleteType } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import type { CyclePrescriptionRequest, CyclePrescriptionSnapshot } from '@/domain/prescriptions/generator';
import type { WeeklyReviewService } from '@/application/progression/weekly-review';
import { WeeklyReviewPanel } from '@/features/review/WeeklyReviewPanel';
import { defaultSettings, type SettingsStore, type TrainingSettings } from '@/features/settings/settings';
import type { BackupService } from '@/application/export';

export interface PlanPrograms {
  createPlan(requests: readonly CyclePrescriptionRequest[]): Promise<readonly CyclePrescriptionSnapshot[]>;
  listCycleSnapshots(): Promise<readonly CyclePrescriptionSnapshot[]>;
  getActiveCycleId(): Promise<string | null>;
  activateCycle(id: string): Promise<void>;
}

const names = { hypertrophy: 'Hipertrofia', strength: 'Fuerza', power: 'Potencia', transition: 'Transición obligatoria', reentry: 'Reentrada' } as const;
const dayNames: Record<string, string> = { monday: 'Lunes', wednesday: 'Miércoles', friday: 'Viernes' };
const roleNames: Record<string, string> = { activation: 'Activación', primary: 'Trabajo principal', secondary: 'Trabajo complementario', accessory: 'Trabajo complementario', mobility: 'Movilidad', 'power-primer': 'Preparación de potencia', core: 'Zona media', plyometric: 'Potencia' };

export function PlanReferenceScreen({ onOpenBackup, onOpenSettings, programs, reviews, settingsStore }: { backups?: BackupService; onOpenBackup?: () => void; onOpenSettings?: () => void; programs: PlanPrograms; reviews?: WeeklyReviewService; settingsStore?: SettingsStore }) {
  const theme = useAppTheme();
  const [weeks, setWeeks] = useState('4');
  const [cycles, setCycles] = useState<readonly CyclePrescriptionSnapshot[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'danger' | 'success' } | null>(null);
  const [planningSettings, setPlanningSettings] = useState<TrainingSettings>(defaultSettings);
  const [reviewEligible, setReviewEligible] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([programs.listCycleSnapshots(), programs.getActiveCycleId()]).then(([storedCycles, activeId]) => {
      if (live) { setCycles(storedCycles); setActive(activeId); }
    });
    return () => { live = false; };
  }, [programs]);
  useEffect(() => { if (settingsStore) void settingsStore.load().then(setPlanningSettings); }, [settingsStore]);
  useEffect(() => {
    let live = true;
    if (active && reviews?.isEligible) void reviews.isEligible(active, 1).then((eligible) => { if (live) setReviewEligible(eligible); });
    return () => { live = false; };
  }, [active, reviews]);

  const create = async () => {
    const length = Number(weeks);
    if (!Number.isInteger(length) || length < 1 || length > 12) { setFeedback({ message: 'Ingresa una duración entre 1 y 12 semanas.', tone: 'danger' }); return; }
    setBusy(true);
    try {
          const profile = settingsStore && planningSettings.profile ? { ...planningSettings.profile, units: planningSettings.units, availableIncrement: Math.min(...planningSettings.increments) } : undefined;
          const planningInputs = settingsStore ? {
            equipment: [...planningSettings.equipment],
            schedule: [...planningSettings.schedule],
            requirements: planningSettings.requirements.map((requirement) => ({ ...requirement })),
            restrictions: [...planningSettings.restrictions],
          } : {};
          const nextCycles = await programs.createPlan([
            { id: 'reentry-draft', type: 'reentry', weeks: 2, ...(profile ? { profile } : {}), ...planningInputs },
            { id: 'hypertrophy-draft', type: 'hypertrophy', weeks: length, ...(profile ? { profile } : {}), ...planningInputs },
            { id: 'strength-draft', type: 'strength', weeks: 4, ...(profile ? { profile } : {}), ...planningInputs },
            { id: 'power-draft', type: 'power', weeks: 2, ...(profile ? { profile } : {}), ...planningInputs },
          ]);
          const unchanged = JSON.stringify(nextCycles) === JSON.stringify(cycles);
          setCycles(nextCycles);
          setFeedback({ message: unchanged ? 'La vista previa no cambió.' : 'Vista previa creada y guardada en este dispositivo.', tone: 'success' });
    } catch (error) { setFeedback({ message: error instanceof InsufficientWorkoutError || error instanceof CatalogRequirementError ? error.message : 'No se pudo crear la vista previa. Revisa la configuración.', tone: 'danger' }); } finally { setBusy(false); }
  };
  const activate = async () => {
    if (busy) return;
    const first = cycles.find(({ type }) => type !== 'transition');
    if (!first) return;
    setBusy(true);
    try {
      await programs.activateCycle(first.id);
      setActive(first.id);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'No se pudo activar el plan. Revisa la vista previa e inténtalo de nuevo.', tone: 'danger' });
    } finally { setBusy(false); }
  };

  return <Screen testID="plan-screen">
    <AppMasthead context="Crea el plan sin conexión. Nada se activa sin tu confirmación." title="PLAN" />
    {active ? <View><AppText variant="caption">Plan activo</AppText><PhaseBand current={1} label={`ACTIVO · ${names[cycles.find(({ id }) => id === active)?.type ?? 'strength']}`} total={cycles.find(({ id }) => id === active)?.weeks.length ?? 1} /><AppText variant="bodyStrong">Próxima decisión: revisión semanal</AppText></View> : <Panel accent={palette.hypertrophy}>
      <AppText accessibilityRole="header" aria-level={2} variant="heading">Nuevo ciclo</AppText>
      <TextField accessibilityLabel="Semanas de hipertrofia" keyboardType="number-pad" label="Semanas de hipertrofia" onChangeText={setWeeks} value={weeks} />
      <AppText color="muted" variant="caption">Después se prepara Fuerza · 4 semanas. La descarga intermedia no se puede eliminar.</AppText>
      <ActionButton accessibilityLabel="Crear vista previa del ciclo" onPress={create}>{busy ? 'Creando…' : 'Crear vista previa'}</ActionButton>
      {feedback ? <FeedbackBanner message={feedback.message} tone={feedback.tone} /> : null}
    </Panel>}
    {!active && cycles.length > 0 ? <Panel accent={palette.transition}><AppText variant="bodyStrong">Confirma antes de activar</AppText><AppText color="muted">Se guardarán todas las semanas y sesiones. El calendario por sí solo nunca avanzará el ciclo.</AppText><ActionButton accessibilityLabel="Activar plan confirmado" disabled={busy} onPress={activate}>Activar plan</ActionButton></Panel> : null}
    <OperationalSection label="HERRAMIENTAS DEL PLAN"><AppText color="muted">Edita tu perfil y equipo, o administra una copia local, en pantallas separadas.</AppText>{onOpenSettings ? <ActionButton accessibilityLabel="Abrir configuración del plan" onPress={onOpenSettings} tone="secondary">Configuración del plan</ActionButton> : null}{onOpenBackup ? <ActionButton accessibilityLabel="Abrir respaldo y recuperación" onPress={onOpenBackup} tone="secondary">Respaldo y recuperación</ActionButton> : null}</OperationalSection>
    <View style={[styles.programRail, { borderColor: theme.border }]} testID="program-rail">
      <View style={styles.railHeader}><AppText accessibilityRole="header" aria-level={2} style={styles.railTitle}>PROGRAMA</AppText><AppText style={styles.railState}>{active ? 'EN CURSO' : 'BORRADOR'}</AppText></View>
      {cycles.length === 0 ? <View style={styles.emptyRail}><AppText variant="bodyStrong">Todavía no hay ciclos</AppText><AppText color="muted">Configura la duración para crear una línea de tiempo persistente.</AppText></View> : cycles.flatMap((cycle) => cycle.weeks.map((week) => ({ cycle, week }))).map(({ cycle, week }) => {
        const key = `${cycle.id}-${week.index}`; const open = expanded === key;
        const state = active === cycle.id ? 'ACTIVO' : active ? 'LISTO' : 'BORRADOR';
        const transition = cycle.type === 'transition';
        const rowText = transition ? palette.ink : theme.text;
        const rowMuted = transition ? palette.steel : theme.textMuted;
        const kicker = transition || !theme.dark ? palette.caution : palette.signal;
        return <View key={key} style={[styles.railRow, { borderBottomColor: theme.border }, transition && styles.transition]} testID={transition ? 'transition-block' : undefined}>
          <View style={styles.ordinal}><AppText style={[styles.ordinalText, { color: rowText }]}>{String(week.index).padStart(2, '0')}</AppText></View>
          <Pressable accessibilityLabel={`Semana ${week.index} de ${names[cycle.type]}, ${week.sessions.length} sesiones, ${state}`} accessibilityRole="button" onPress={() => setExpanded(open ? null : key)} style={styles.week}>
            <View style={styles.flex}>
              <View style={styles.between}>
                <AppText style={[styles.weekKicker, { color: kicker }]}>{transition ? 'TRANSICIÓN · DESCARGA' : `SEMANA ${week.index}`}</AppText>
                <AppText style={[styles.stateText, { color: rowMuted }]}>{state}</AppText>
              </View>
              <AppText style={[styles.weekTitle, { color: rowText }]}>{names[cycle.type]}</AppText>
              <AppText style={{ color: rowMuted }} variant="caption">{week.sessions.length} sesiones · toca para ver detalles</AppText>
              {open ? <View style={[styles.sessions, { borderColor: rowMuted }]}>
                {week.sessions.map((session) => <View key={session.dayIndex}>
                  <AppText style={{ color: rowText }} variant="bodyStrong">{session.day ? (dayNames[session.day] ?? `Día ${session.dayIndex}`) : `Día ${session.dayIndex} · ${session.exercises.length} ${session.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}`}</AppText>
                  {(session.blocks ?? [{ role: 'primary', exercises: session.exercises }]).filter((block) => block.role !== 'finish-review').map((block, blockIndex) => <View key={blockIndex}>
                    <AppText style={{ color: rowMuted }} variant="caption">{roleNames[block.role] ?? 'Bloque de entrenamiento'}</AppText>
                    {block.exercises.map((exercise, index) => <View key={`${exercise.exerciseId}-${index}`}>
                      <AppText style={{ color: rowText }} variant="bodyStrong">{exerciseCatalog.find(({ id }) => id === exercise.exerciseId)?.name ?? `Ejercicio no disponible: ${exercise.exerciseId}`}</AppText>
                      {exercise.target ? <>
                        <AppText style={{ color: rowMuted }} variant="caption">{exercise.target.sets} series · {exercise.target.reps.min}–{exercise.target.reps.max} repeticiones · RIR {exercise.target.rir.min}–{exercise.target.rir.max}</AppText>
                        <AppText style={{ color: rowMuted }} variant="caption">{exercise.calculatedLoad !== undefined ? `${exercise.calculatedLoad} ${exercise.loadProvenance?.match(/\b(kg|lb);/)?.[1] ?? '(unidad no registrada)'}` : 'Carga por definir'}</AppText>
                      </> : <AppText style={{ color: rowMuted }} variant="caption">Prescripción no disponible</AppText>}
                    </View>)}
                  </View>)}
                </View>)}
              </View> : null}
            </View>
            <ChevronDown color={rowMuted} size={20} />
          </Pressable>
        </View>;
      })}
      {active && reviews && reviewEligible && cycles.find(({ id }) => id === active)?.weeks.length && (cycles.find(({ id }) => id === active)?.weeks.length ?? 0) > 1 ? <WeeklyReviewPanel cycleId={active} nextWeekIndex={2} reviews={reviews} /> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({ activeBand: { backgroundColor: athletePalette.ink, gap: athleteSpacing.sm, padding: athleteSpacing.lg }, bandLabel: { ...athleteType.caption, color: athletePalette.signal }, bandTitle: { ...athleteType.heading, color: athletePalette.paper }, bandCopy: { ...athleteType.body, color: athletePalette.paper }, between: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' }, copy: { gap: spacing.md }, emptyRail: { gap: athleteSpacing.sm, minHeight: 96, padding: athleteSpacing.lg }, flex: { flex: 1, minWidth: 160 }, ordinal: { alignItems: 'center', justifyContent: 'center', minHeight: 80, width: 56 }, ordinalText: { ...athleteType.sequence, color: athletePalette.ink }, programRail: { borderColor: athletePalette.ink, borderTopWidth: 4 }, railHeader: { alignItems: 'center', backgroundColor: athletePalette.signal, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, padding: athleteSpacing.lg }, railTitle: { ...athleteType.title, color: athletePalette.ink }, railState: { ...athleteType.caption, color: athletePalette.ink }, railRow: { alignItems: 'stretch', borderBottomColor: athletePalette.line, borderBottomWidth: 1, flexDirection: 'row' }, sessions: { borderTopWidth: 1, gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md }, stateText: { ...athleteType.caption, color: athletePalette.steel }, transition: { backgroundColor: '#FFF5D6', borderLeftColor: athletePalette.caution, borderLeftWidth: 4 }, week: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 80, padding: athleteSpacing.md }, weekKicker: { ...athleteType.caption, color: athletePalette.caution }, weekTitle: { ...athleteType.heading, color: athletePalette.ink } });
