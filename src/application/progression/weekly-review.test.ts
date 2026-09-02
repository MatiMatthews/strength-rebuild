import type { RepositoryDatabase } from '../../data/repositories';
import { WeeklyReviewService } from './weekly-review';

function database() {
  const rows = new Map<string, unknown>();
  const calls: string[] = [];
  const db: RepositoryDatabase = {
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async (sql: string) => sql.includes('training_week') ? { snapshot_json: JSON.stringify({ index: 2, sessions: [] }) } : null) as RepositoryDatabase['getFirstAsync'],
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => { calls.push(sql); rows.set(sql, params); return { changes: 1, lastInsertRowId: 1 }; }),
    withTransactionAsync: async (task) => task(),
  };
  return { calls, db, rows };
}

describe('WeeklyReviewService', () => {
  it('requires every persisted session in the week to be terminal', async () => {
    const { db } = database();
    const service = new WeeklyReviewService(db);
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce({ required_count: 2, terminal_count: 1 });
    await expect(service.isEligible('cycle-1', 1)).resolves.toBe(false);
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce({ required_count: 2, terminal_count: 2 });
    await expect(service.isEligible('cycle-1', 1)).resolves.toBe(true);
  });
  it.each([
    ['successful', 'progress'], ['missed', 'reduce'], ['failed', 'repeat'],
    ['restricted', 'hold'], ['repeated', 'repeat'],
  ] as const)('proposes an explained %s week without mutating the plan', async (outcome, action) => {
    const { calls, db } = database();
    const service = new WeeklyReviewService(db, () => '2026-08-18T01:00:00.000Z', () => 'proposal-1');
    const proposal = await service.propose({ cycleId: 'cycle-1', weekIndex: 1, nextWeekIndex: 2, outcome });
    expect(proposal.action).toBe(action);
    expect(proposal.explanation).toBeTruthy();
    expect(calls.some((sql) => sql.includes('UPDATE training_week'))).toBe(false);
  });

  it('applies a proposal only after acceptance and logs the decision', async () => {
    const { calls, db } = database();
    const service = new WeeklyReviewService(db, () => '2026-08-18T01:00:00.000Z', () => 'proposal-1');
    await service.propose({ cycleId: 'cycle-1', weekIndex: 1, nextWeekIndex: 2, outcome: 'successful' });
    await service.decide('proposal-1', true);
    expect(calls.some((sql) => sql.includes('UPDATE training_week'))).toBe(true);
    expect(calls.some((sql) => sql.includes('INSERT INTO decision_log'))).toBe(true);
  });

  it('records rejection without changing the future plan', async () => {
    const { calls, db } = database();
    const service = new WeeklyReviewService(db, () => '2026-08-18T01:00:00.000Z', () => 'proposal-1');
    await service.propose({ cycleId: 'cycle-1', weekIndex: 1, nextWeekIndex: 2, outcome: 'successful' });
    await service.decide('proposal-1', false);
    expect(calls.some((sql) => sql.includes('UPDATE training_week'))).toBe(false);
    expect(calls.some((sql) => sql.includes('INSERT INTO decision_log'))).toBe(true);
  });
});
