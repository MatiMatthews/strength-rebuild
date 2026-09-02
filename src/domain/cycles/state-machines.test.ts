import {
  reduceCycle,
  reduceSession,
  reduceWeek,
  type CycleState,
  type SessionState,
  type WeekState,
} from './state-machines';

describe('cycle state machine', () => {
  const allowed: readonly [CycleState, Parameters<typeof reduceCycle>[1], CycleState][] = [
    ['DRAFT', { type: 'MARK_READY' }, 'READY'],
    ['READY', { type: 'ACTIVATE' }, 'ACTIVE'],
    ['ACTIVE', { type: 'PAUSE' }, 'PAUSED'],
    ['ACTIVE', { type: 'REQUIRE_REVIEW' }, 'REVIEW_REQUIRED'],
    ['ACTIVE', { type: 'FINISH_LOADING', nextCycleDiffers: true }, 'TRANSITION'],
    ['ACTIVE', { type: 'FINISH_LOADING', nextCycleDiffers: false }, 'COMPLETED'],
    ['PAUSED', { type: 'RESUME', daysWithoutStrengthTraining: 13 }, 'READY'],
    ['PAUSED', { type: 'RESUME', daysWithoutStrengthTraining: 14 }, 'REENTRY'],
    ['REENTRY', { type: 'COMPLETE_REENTRY', confirmed: true }, 'READY'],
    ['TRANSITION', { type: 'COMPLETE_TRANSITION', confirmed: true }, 'READY'],
    ['REVIEW_REQUIRED', { type: 'RESOLVE_REVIEW', approvedState: 'READY' }, 'READY'],
    ['REVIEW_REQUIRED', { type: 'RESOLVE_REVIEW', approvedState: 'PAUSED' }, 'PAUSED'],
    ['READY', { type: 'COMPLETE_WITHOUT_NEXT_CYCLE', confirmed: true }, 'COMPLETED'],
  ];

  it.each(allowed)('%s + %j -> %s', (state, event, expected) => {
    expect(reduceCycle(state, event)).toEqual({ accepted: true, state: expected });
  });

  const forbidden: readonly [CycleState, Parameters<typeof reduceCycle>[1], string][] = [
    ['DRAFT', { type: 'ACTIVATE' }, 'INVALID_TRANSITION'],
    ['ACTIVE', { type: 'MARK_READY' }, 'INVALID_TRANSITION'],
    ['PAUSED', { type: 'RESUME', daysWithoutStrengthTraining: -1 }, 'INVALID_INPUT'],
    ['REENTRY', { type: 'COMPLETE_REENTRY', confirmed: false }, 'CONFIRMATION_REQUIRED'],
    ['TRANSITION', { type: 'COMPLETE_TRANSITION', confirmed: false }, 'CONFIRMATION_REQUIRED'],
    ['READY', { type: 'COMPLETE_WITHOUT_NEXT_CYCLE', confirmed: false }, 'CONFIRMATION_REQUIRED'],
    ['COMPLETED', { type: 'ACTIVATE' }, 'TERMINAL_STATE'],
    ['ACTIVE', { type: 'CALENDAR_ELAPSED' }, 'CALENDAR_ONLY_ADVANCE_FORBIDDEN'],
  ];

  it.each(forbidden)('rejects %s + %j', (state, event, reason) => {
    expect(reduceCycle(state, event)).toEqual({ accepted: false, state, reason });
  });

  it('rejects every state/event combination outside the transition table', () => {
    const states: readonly CycleState[] = ['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'REENTRY', 'TRANSITION', 'REVIEW_REQUIRED', 'COMPLETED'];
    const events: readonly Parameters<typeof reduceCycle>[1][] = [
      { type: 'MARK_READY' }, { type: 'ACTIVATE' }, { type: 'PAUSE' }, { type: 'REQUIRE_REVIEW' },
      { type: 'FINISH_LOADING', nextCycleDiffers: true }, { type: 'FINISH_LOADING', nextCycleDiffers: false },
      { type: 'RESUME', daysWithoutStrengthTraining: 13 }, { type: 'RESUME', daysWithoutStrengthTraining: 14 },
      { type: 'COMPLETE_REENTRY', confirmed: true }, { type: 'COMPLETE_TRANSITION', confirmed: true },
      { type: 'RESOLVE_REVIEW', approvedState: 'READY' }, { type: 'COMPLETE_WITHOUT_NEXT_CYCLE', confirmed: true },
      { type: 'CALENDAR_ELAPSED' },
    ];
    const allowedPairs = new Set(allowed.map(([state, event]) => `${state}:${JSON.stringify(event)}`));

    for (const state of states) for (const event of events) {
      const result = reduceCycle(state, event);
      expect(result.accepted).toBe(allowedPairs.has(`${state}:${JSON.stringify(event)}`));
    }
  });
});

describe('week state machine', () => {
  const allowed: readonly [WeekState, Parameters<typeof reduceWeek>[1], WeekState][] = [
    ['PLANNED', { type: 'START' }, 'ACTIVE'],
    ['ACTIVE', { type: 'SUBMIT_FOR_REVIEW' }, 'REVIEW'],
    ['REVIEW', { type: 'CONFIRM_COMPLETION', confirmed: true }, 'COMPLETED'],
    ['REVIEW', { type: 'REPEAT', confirmed: true }, 'REPEATED'],
    ['REVIEW', { type: 'REQUIRE_REVIEW' }, 'REVIEW_REQUIRED'],
    ['REPEATED', { type: 'PLAN_REPEAT' }, 'PLANNED'],
    ['REVIEW_REQUIRED', { type: 'RESOLVE_REVIEW', repeat: true }, 'REPEATED'],
    ['REVIEW_REQUIRED', { type: 'RESOLVE_REVIEW', repeat: false }, 'REVIEW'],
  ];

  it.each(allowed)('%s + %j -> %s', (state, event, expected) => {
    expect(reduceWeek(state, event)).toEqual({ accepted: true, state: expected });
  });

  const forbidden: readonly [WeekState, Parameters<typeof reduceWeek>[1], string][] = [
    ['PLANNED', { type: 'CONFIRM_COMPLETION', confirmed: true }, 'INVALID_TRANSITION'],
    ['REVIEW', { type: 'CONFIRM_COMPLETION', confirmed: false }, 'CONFIRMATION_REQUIRED'],
    ['REVIEW', { type: 'REPEAT', confirmed: false }, 'CONFIRMATION_REQUIRED'],
    ['COMPLETED', { type: 'START' }, 'TERMINAL_STATE'],
    ['ACTIVE', { type: 'CALENDAR_ELAPSED' }, 'CALENDAR_ONLY_ADVANCE_FORBIDDEN'],
  ];

  it.each(forbidden)('rejects %s + %j', (state, event, reason) => {
    expect(reduceWeek(state, event)).toEqual({ accepted: false, state, reason });
  });

  it('rejects every state/event combination outside the transition table', () => {
    const states: readonly WeekState[] = ['PLANNED', 'ACTIVE', 'REVIEW', 'REPEATED', 'REVIEW_REQUIRED', 'COMPLETED'];
    const events: readonly Parameters<typeof reduceWeek>[1][] = [
      { type: 'START' }, { type: 'SUBMIT_FOR_REVIEW' }, { type: 'CONFIRM_COMPLETION', confirmed: true },
      { type: 'REPEAT', confirmed: true }, { type: 'REQUIRE_REVIEW' }, { type: 'PLAN_REPEAT' },
      { type: 'RESOLVE_REVIEW', repeat: true }, { type: 'RESOLVE_REVIEW', repeat: false }, { type: 'CALENDAR_ELAPSED' },
    ];
    const allowedPairs = new Set(allowed.map(([state, event]) => `${state}:${JSON.stringify(event)}`));

    for (const state of states) for (const event of events) {
      expect(reduceWeek(state, event).accepted).toBe(allowedPairs.has(`${state}:${JSON.stringify(event)}`));
    }
  });
});

describe('session state machine', () => {
  const allowed: readonly [SessionState, Parameters<typeof reduceSession>[1], SessionState][] = [
    ['PLANNED', { type: 'BEGIN_READINESS' }, 'READINESS_GATE'],
    ['READINESS_GATE', { type: 'START', cleared: true }, 'IN_PROGRESS'],
    ['READINESS_GATE', { type: 'REQUIRE_REVIEW' }, 'REVIEW_REQUIRED'],
    ['IN_PROGRESS', { type: 'COMPLETE', modified: false }, 'COMPLETED'],
    ['IN_PROGRESS', { type: 'COMPLETE', modified: true }, 'MODIFIED'],
    ['IN_PROGRESS', { type: 'ABORT' }, 'ABORTED'],
    ['REVIEW_REQUIRED', { type: 'RETURN_TO_READINESS', resolved: true }, 'READINESS_GATE'],
  ];

  it.each(allowed)('%s + %j -> %s', (state, event, expected) => {
    expect(reduceSession(state, event)).toEqual({ accepted: true, state: expected });
  });

  const forbidden: readonly [SessionState, Parameters<typeof reduceSession>[1], string][] = [
    ['PLANNED', { type: 'START', cleared: true }, 'INVALID_TRANSITION'],
    ['READINESS_GATE', { type: 'START', cleared: false }, 'READINESS_NOT_CLEARED'],
    ['REVIEW_REQUIRED', { type: 'RETURN_TO_READINESS', resolved: false }, 'REVIEW_NOT_RESOLVED'],
    ['COMPLETED', { type: 'ABORT' }, 'TERMINAL_STATE'],
    ['MODIFIED', { type: 'BEGIN_READINESS' }, 'TERMINAL_STATE'],
    ['ABORTED', { type: 'BEGIN_READINESS' }, 'TERMINAL_STATE'],
    ['IN_PROGRESS', { type: 'CALENDAR_ELAPSED' }, 'CALENDAR_ONLY_ADVANCE_FORBIDDEN'],
  ];

  it.each(forbidden)('rejects %s + %j', (state, event, reason) => {
    expect(reduceSession(state, event)).toEqual({ accepted: false, state, reason });
  });

  it('rejects every state/event combination outside the transition table', () => {
    const states: readonly SessionState[] = ['PLANNED', 'READINESS_GATE', 'IN_PROGRESS', 'REVIEW_REQUIRED', 'COMPLETED', 'MODIFIED', 'ABORTED'];
    const events: readonly Parameters<typeof reduceSession>[1][] = [
      { type: 'BEGIN_READINESS' }, { type: 'START', cleared: true }, { type: 'REQUIRE_REVIEW' },
      { type: 'COMPLETE', modified: false }, { type: 'COMPLETE', modified: true }, { type: 'ABORT' },
      { type: 'RETURN_TO_READINESS', resolved: true }, { type: 'CALENDAR_ELAPSED' },
    ];
    const allowedPairs = new Set(allowed.map(([state, event]) => `${state}:${JSON.stringify(event)}`));

    for (const state of states) for (const event of events) {
      expect(reduceSession(state, event).accepted).toBe(allowedPairs.has(`${state}:${JSON.stringify(event)}`));
    }
  });
});
