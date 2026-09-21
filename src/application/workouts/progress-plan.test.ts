import { DatabaseSync } from "node:sqlite";
import { migrateDatabase, type MigrationDatabase } from "../../data/migrations";
import type { RepositoryDatabase, SqlValue } from "../../data/repositories";
import { ProgramService } from "../programs/program-service";
import { readProgressPlan } from "./progress-plan";

it("counts planned sessions once, excludes future drafts, and retains previously trained cycles without writing", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const db = {
    exec: (sql: string) => sqlite.exec(sql),
    runAsync: async (sql: string, ...params: SqlValue[]) => {
      const result = sqlite.prepare(sql).run(...params);
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    getFirstAsync: async (sql: string, ...params: SqlValue[]) =>
      (sqlite.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql: string, ...params: SqlValue[]) =>
      sqlite.prepare(sql).all(...params) as never,
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as RepositoryDatabase & MigrationDatabase;
  try {
    await migrateDatabase(db);
    const programs = new ProgramService(db);
    await programs.createPlan([
      { id: "trained", type: "strength", weeks: 2 },
      { id: "future", type: "hypertrophy", weeks: 2 },
    ]);
    await programs.activateCycle("trained");
    for (const id of ["first", "duplicate"]) {
      sqlite
        .prepare(
          "INSERT INTO workout_session (id,schema_version,created_at,updated_at,status,session_plan_id,prescribed_snapshot_json,actual_snapshot_json) VALUES (?,1,'now','now','COMPLETED','trained-week-1-day-1','{}','{}')",
        )
        .run(id);
    }
    sqlite.exec(
      "UPDATE session_plan SET status = 'COMPLETED' WHERE id = 'trained-week-1-day-2'",
    );
    const before = sqlite
      .prepare("SELECT * FROM session_plan ORDER BY id")
      .all();
    const result = await readProgressPlan(db);
    expect(result).toHaveLength(6);
    expect(result.every((item) => item.cycleId === "trained")).toBe(true);
    expect(result.filter((item) => item.completed)).toHaveLength(1);
    expect(result.map((item) => [item.weekIndex, item.dayIndex])).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
    sqlite.exec("UPDATE cycle SET status = 'READY' WHERE id = 'trained'");
    expect(await readProgressPlan(db)).toEqual(result);
    expect(
      sqlite.prepare("SELECT * FROM session_plan ORDER BY id").all(),
    ).toEqual(before);
  } finally {
    sqlite.close();
  }
});
