export const PROGRESSION_POLICY_VERSION = 'progression-v1';

export interface ProgressionInput {
  readonly exerciseId: string;
  readonly role: 'main' | 'accessory';
  readonly target: {
    readonly sets: number;
    readonly prescribedReps: number;
    readonly reps: { readonly min: number; readonly max: number };
    readonly load: number;
    readonly targetRir: number;
  };
  readonly completed: {
    readonly sets: number;
    readonly repsPerSet: readonly number[];
    readonly terminalRir: number;
    readonly technique: 'good' | 'altered' | 'failed';
    readonly pain: number;
  };
  readonly consecutiveSuccessfulExposures: number;
  readonly consecutiveFailedExposures: number;
  readonly availableLoadIncrements: readonly number[];
  readonly safetyFlagActive: boolean;
}

export type ProgressionAction = 'hold' | 'add_reps' | 'add_load' | 'reduce_load' | 'repeat_week';

export interface ProgressionProposal {
  readonly schemaVersion: 1;
  readonly policyVersion: typeof PROGRESSION_POLICY_VERSION;
  readonly exerciseId: string;
  readonly action: ProgressionAction;
  readonly nextTarget: { readonly sets: number; readonly reps: number; readonly load: number };
  readonly explanation: string;
}

function freezeProposal(proposal: ProgressionProposal): Readonly<ProgressionProposal> {
  Object.freeze(proposal.nextTarget);
  return Object.freeze(proposal);
}

function proposal(
  input: ProgressionInput,
  action: ProgressionAction,
  explanation: string,
  changes: Partial<ProgressionProposal['nextTarget']> = {},
): Readonly<ProgressionProposal> {
  return freezeProposal({
    schemaVersion: 1,
    policyVersion: PROGRESSION_POLICY_VERSION,
    exerciseId: input.exerciseId,
    action,
    nextTarget: {
      sets: input.target.sets,
      reps: input.target.prescribedReps,
      load: input.target.load,
      ...changes,
    },
    explanation,
  });
}

function completedPrescribedWork(input: ProgressionInput): boolean {
  return input.completed.sets >= input.target.sets
    && input.completed.repsPerSet.length >= input.target.sets
    && input.completed.repsPerSet.every((reps) => reps >= input.target.prescribedReps);
}

export function proposeProgression(input: ProgressionInput): Readonly<ProgressionProposal> {
  const effortFailure = input.completed.terminalRir <= input.target.targetRir - 2;
  const missedWork = !completedPrescribedWork(input);
  const qualityBlocked = input.safetyFlagActive
    || input.completed.technique !== 'good'
    || input.completed.pain > 2;
  const failed = effortFailure || missedWork || qualityBlocked;

  if (failed && input.consecutiveFailedExposures + 1 >= 2) {
    return proposal(input, 'repeat_week', 'Two failed exposures require repeating or regressing the week.');
  }
  if (effortFailure || missedWork) {
    return proposal(input, 'reduce_load', 'Missed work or effort below target calls for a five-percent load reduction.', {
      load: Number((input.target.load * 0.95).toFixed(3)),
    });
  }
  if (qualityBlocked) {
    return proposal(input, 'hold', 'Safety or quality criteria blocked progression.');
  }

  const successes = input.consecutiveSuccessfulExposures + 1;
  if (input.role === 'main' && successes < 2) {
    return proposal(input, 'hold', 'Main lifts require two successful exposures before progression.');
  }
  if (input.target.prescribedReps < input.target.reps.max) {
    return proposal(input, 'add_reps', 'Completed work progresses repetitions within the allowed range first.', {
      reps: input.target.prescribedReps + 1,
    });
  }

  const smallestIncrement = [...input.availableLoadIncrements]
    .filter((increment) => Number.isFinite(increment) && increment > 0)
    .sort((left, right) => left - right)[0];
  if (smallestIncrement !== undefined && smallestIncrement / input.target.load <= 0.05) {
    return proposal(input, 'add_load', 'At the repetition ceiling, use the smallest available increment within five percent.', {
      load: input.target.load + smallestIncrement,
    });
  }
  return proposal(input, 'hold', 'No available load increment satisfies the five-percent cap.');
}
