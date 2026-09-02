import { PROGRESSION_POLICY_VERSION, proposeProgression, type ProgressionInput } from './propose-progression';

const successfulAccessory: ProgressionInput = {
  exerciseId: 'row',
  role: 'accessory',
  target: { sets: 3, prescribedReps: 10, reps: { min: 8, max: 12 }, load: 20, targetRir: 2 },
  completed: { sets: 3, repsPerSet: [10, 10, 10], terminalRir: 2, technique: 'good', pain: 0 },
  consecutiveSuccessfulExposures: 0,
  consecutiveFailedExposures: 0,
  availableLoadIncrements: [1, 2.5],
  safetyFlagActive: false,
};

describe('proposeProgression', () => {
  it.each([
    ['hold while a main lift awaits its second success', {
      ...successfulAccessory, role: 'main', consecutiveSuccessfulExposures: 0,
    }, 'hold', 20, 10],
    ['adds reps before load', successfulAccessory, 'add_reps', 20, 11],
    ['uses the smallest available increment at the rep ceiling', {
      ...successfulAccessory,
      target: { ...successfulAccessory.target, prescribedReps: 12 },
      completed: { ...successfulAccessory.completed, repsPerSet: [12, 12, 12] },
    }, 'add_load', 21, 12],
    ['holds when the smallest increment exceeds the five-percent cap', {
      ...successfulAccessory,
      target: { ...successfulAccessory.target, prescribedReps: 12, load: 10 },
      completed: { ...successfulAccessory.completed, repsPerSet: [12, 12, 12] },
    }, 'hold', 10, 12],
    ['reduces next exposure after effort is two reps below target', {
      ...successfulAccessory,
      completed: { ...successfulAccessory.completed, terminalRir: 0 },
    }, 'reduce_load', 19, 10],
    ['repeats the week after two failed exposures', {
      ...successfulAccessory,
      consecutiveFailedExposures: 1,
      completed: { ...successfulAccessory.completed, repsPerSet: [8, 7, 6] },
    }, 'repeat_week', 20, 10],
  ] as const)('%s', (_name, input, action, load, reps) => {
    const proposal = proposeProgression(input);
    expect(proposal.action).toBe(action);
    expect(proposal.nextTarget.load).toBe(load);
    expect(proposal.nextTarget.reps).toBe(reps);
    expect(proposal.policyVersion).toBe(PROGRESSION_POLICY_VERSION);
    expect(proposal.explanation.length).toBeGreaterThan(0);
    expect(Object.isFrozen(proposal)).toBe(true);
  });

  it('never increases load and volume together', () => {
    const proposal = proposeProgression({
      ...successfulAccessory,
      target: { ...successfulAccessory.target, prescribedReps: 12 },
      completed: { ...successfulAccessory.completed, repsPerSet: [12, 12, 12] },
    });
    expect(proposal.nextTarget.load).toBeGreaterThan(successfulAccessory.target.load);
    expect(proposal.nextTarget.sets).toBe(successfulAccessory.target.sets);
    expect(proposal.nextTarget.reps).toBe(successfulAccessory.target.reps.max);
  });

  it('holds when success criteria are blocked by technique, pain, or safety', () => {
    const proposal = proposeProgression({
      ...successfulAccessory,
      completed: { ...successfulAccessory.completed, technique: 'altered', pain: 3 },
      safetyFlagActive: true,
    });
    expect(proposal.action).toBe('hold');
    expect(proposal.explanation).toContain('Safety or quality criteria blocked progression.');
  });
});
