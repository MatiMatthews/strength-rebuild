import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { RepositoryDatabase } from '../../data/repositories';
import type { CyclePrescriptionSnapshot } from '../../domain/prescriptions/generator';

export const CYCLE_COMPLETION_POLICY = 'cycle-completion-v1';
type Cycle = { id: string; kind: CyclePrescriptionSnapshot['type']; status: string; program_template_id: string; snapshot_json: string };
export interface CycleCompletion {
  currentId: string;
  currentType: Cycle['kind'];
  nextId: string | null;
  nextType: Cycle['kind'] | null;
  nextWeeks: number;
  reason: string | null;
  source: string;
}

/** Read the same canonical state for preview and commit; no calendar inference. */
export async function inspectCycleCompletion(db: RepositoryDatabase, currentId: string): Promise<CycleCompletion> {
  const current = await db.getFirstAsync<Cycle>('SELECT id, kind, status, program_template_id, snapshot_json FROM cycle WHERE id = ?', currentId);
  if (!current) throw new Error('El ciclo ya no está disponible. Vuelve al plan.');
  const template = await db.getFirstAsync<{ snapshot_json: string }>('SELECT snapshot_json FROM program_template WHERE id = ?', current.program_template_id);
  const sequence = template ? JSON.parse(template.snapshot_json) as CyclePrescriptionSnapshot[] : [];
  const position = sequence.findIndex(cycle => cycle.id === current.id);
  const nextId = sequence[position + 1]?.id ?? null;
  const next = nextId ? await db.getFirstAsync<Cycle>('SELECT id, kind, status, program_template_id, snapshot_json FROM cycle WHERE id = ?', nextId) : null;
  const weeks = await db.getAllAsync<{ id: string; week_index: number; status: string }>('SELECT id, week_index, status FROM training_week WHERE cycle_id = ? ORDER BY week_index', currentId);
  const sessions = await db.getAllAsync<{ id: string; status: string; snapshot_json: string }>('SELECT s.id, s.status, s.snapshot_json FROM session_plan s JOIN training_week w ON w.id = s.training_week_id WHERE w.cycle_id IN (?, ?) ORDER BY s.id', currentId, nextId);
  const unfinishedSessions = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM session_plan s JOIN training_week w ON w.id = s.training_week_id WHERE w.cycle_id = ? AND s.status NOT IN ('COMPLETED', 'SKIPPED')`, currentId);
  const emptyWeeks = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM training_week w WHERE w.cycle_id = ? AND NOT EXISTS (SELECT 1 FROM session_plan s WHERE s.training_week_id = w.id)', currentId);
  const nextStarted = nextId ? await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM training_week w WHERE w.cycle_id = ? AND (w.status <> 'PLANNED' OR EXISTS (SELECT 1 FROM session_plan s LEFT JOIN workout_session recorded ON recorded.session_plan_id = s.id WHERE s.training_week_id = w.id AND (s.status <> 'PLANNED' OR recorded.id IS NOT NULL)))`, nextId) : null;
  const active = await db.getAllAsync<{ id: string }>("SELECT id FROM cycle WHERE status = 'ACTIVE' ORDER BY id");
  const workouts = await db.getAllAsync<{ id: string }>("SELECT id FROM workout_session WHERE status = 'IN_PROGRESS' ORDER BY id");
  const restrictions = await db.getAllAsync<{ id: string }>('SELECT id FROM active_restriction WHERE active = 1 ORDER BY id');
  const proposals = await db.getAllAsync<{ id: string; policy_version: string }>("SELECT id, policy_version FROM progression_proposal WHERE decision IS NULL AND ((cycle_id = ? AND policy_version = 'weekly-review-v1') OR policy_version NOT IN ('progression-v1','weekly-review-v1')) ORDER BY id", currentId);
  const settings = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM app_setting WHERE key = 'training-settings'");
  const decisions = await db.getAllAsync<{ id: string; inputs_json: string; output_json: string }>("SELECT id, inputs_json, output_json FROM decision_log WHERE policy_version <> 'cycle-completion-v1' ORDER BY id");
  const snapshot = JSON.parse(current.snapshot_json) as CyclePrescriptionSnapshot;
  let reason: string | null = null;
  if (current.status !== 'ACTIVE' || active.length !== 1 || active[0]?.id !== currentId) reason = 'El ciclo activo cambió. Vuelve al plan.';
  else if (position < 0 || sequence[position]?.type !== current.kind || (nextId && (!next || next.program_template_id !== current.program_template_id || next.status !== 'READY' || next.kind !== sequence[position + 1]?.type || Boolean(nextStarted?.count)))) reason = 'El siguiente ciclo no está disponible. Revisa el plan.';
  else if (next && ['hypertrophy', 'strength', 'power'].includes(current.kind) && ['hypertrophy', 'strength', 'power'].includes(next.kind) && current.kind !== next.kind) reason = 'Se requiere una semana de transición antes de cambiar de carga.';
  else if (weeks.length !== snapshot.weeks.length || weeks.length === 0 || weeks.some(week => week.status !== 'COMPLETED') || unfinishedSessions?.count || emptyWeeks?.count) reason = current.kind === 'transition' ? 'Completa las sesiones de descarga y su revisión semanal antes de continuar.' : 'Completa todas las sesiones y revisiones semanales antes de continuar.';
  else if (workouts.length) reason = 'Termina el entrenamiento abierto antes de cambiar de ciclo.';
  else if (restrictions.length) reason = 'Hay una restricción de seguridad activa. No se puede avanzar de ciclo.';
  else if (proposals.length) reason = 'Resuelve las decisiones pendientes en Hoy y la revisión semanal antes de continuar.';
  return { currentId, currentType: current.kind, nextId, nextType: next?.kind ?? null,
    nextWeeks: next ? (JSON.parse(next.snapshot_json) as CyclePrescriptionSnapshot).weeks.length : 0, reason,
    source: bytesToHex(sha256(JSON.stringify({ template, current, next, weeks, sessions, active, workouts, restrictions, proposals, settings, decisions }))) };
}
