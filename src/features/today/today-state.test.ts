import { deriveTodayState } from './today-state';

describe('deriveTodayState', () => {
  it('prioritizes review and active-session recovery over the planned session', () => {
    expect(deriveTodayState({ today: null })).toEqual({ kind: 'empty' });
    expect(deriveTodayState({ today: null, reviewRequired: true })).toEqual({ kind: 'review-required' });
    expect(deriveTodayState({ today: { cycleId: 'x' } as never, activeSession: true })).toMatchObject({ kind: 'resume' });
  });

  it('represents rest days and active restrictions explicitly', () => {
    expect(deriveTodayState({ today: { cycleId: 'x' } as never, scheduledToday: false, nextSessionLabel: 'Miércoles' }))
      .toEqual({ kind: 'no-workout', nextSessionLabel: 'Miércoles' });
    expect(deriveTodayState({ today: { cycleId: 'x' } as never, restrictionActive: true })).toMatchObject({ kind: 'restriction' });
  });
});
