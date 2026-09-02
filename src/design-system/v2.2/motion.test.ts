import { motionDuration, motionDurations } from './motion';

describe('Athlete System motion contract', () => {
  it('caps feedback, row, and route motion and collapses it when reduced motion is active', () => {
    expect(motionDurations).toEqual({ press: 120, row: 180, screen: 240 });
    expect(motionDuration('screen', false)).toBe(240);
    expect(motionDuration('screen', true)).toBe(0);
  });
});
