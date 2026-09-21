import type { RepositoryDatabase } from "../../data/repositories";

export interface ProgressPlanSession {
  sessionPlanId: string;
  cycleId: string;
  cycleType: string;
  cycleCreatedAt: string;
  weekIndex: number;
  dayIndex: number;
  completed: boolean;
}

export async function readProgressPlan(
  db: RepositoryDatabase,
): Promise<ProgressPlanSession[]> {
  const rows = await db.getAllAsync<{
    id: string;
    cycle_id: string;
    kind: string;
    created_at: string;
    week_index: number;
    day_index: number;
    completed: number;
  }>(`
    SELECT s.id, c.id AS cycle_id, c.kind, c.created_at, w.week_index, s.day_index,
      EXISTS(SELECT 1 FROM workout_session done WHERE done.session_plan_id = s.id AND done.status = 'COMPLETED') AS completed
    FROM session_plan s JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id
    WHERE c.status IN ('ACTIVE', 'COMPLETED') OR EXISTS (
      SELECT 1 FROM training_week old_week JOIN session_plan old_plan ON old_plan.training_week_id = old_week.id
      JOIN workout_session done ON done.session_plan_id = old_plan.id
      WHERE old_week.cycle_id = c.id AND done.status = 'COMPLETED')
    ORDER BY c.created_at, c.id, w.week_index, s.day_index`);
  return rows.map((row) => ({
    sessionPlanId: row.id,
    cycleId: row.cycle_id,
    cycleType: row.kind,
    cycleCreatedAt: row.created_at,
    weekIndex: row.week_index,
    dayIndex: row.day_index,
    completed: Boolean(row.completed),
  }));
}
