export type PainTrend = 'stable' | 'increasing' | 'acute';
export type WarningFlag = 'NEUROLOGICAL' | 'SYSTEMIC';
export type SafetyDisposition =
  | 'CONTINUE_CONSERVATIVELY'
  | 'CONTINUE_WITH_RESTRICTIONS'
  | 'MODIFY_SET'
  | 'STOP_PATTERN'
  | 'REVIEW_REQUIRED';
export type SafetyAction =
  | 'STOP_SET'
  | 'REDUCE_LOAD_OR_RANGE_OR_SUBSTITUTE_ONCE'
  | 'REMOVE_PATTERN_FOR_DAY'
  | 'STOP_PATTERN'
  | 'ABORT_SESSION'
  | 'ENTER_REVIEW_REQUIRED';
export type BlockedTraining =
  | 'HEAVY_LOADING'
  | 'MAXIMAL_BRACING'
  | 'POWER'
  | 'PAINFUL_SET_INTENSIFIERS';

export interface SafetyInput {
  readonly pain: number;
  readonly painTrend: PainTrend;
  readonly techniqueChanged?: boolean;
  readonly persistsAfterModification?: boolean;
  readonly abdominalRestrictionActive?: boolean;
  readonly warningFlags?: readonly WarningFlag[];
}

export interface SafetyResult {
  readonly disposition: SafetyDisposition;
  readonly reviewRequired: boolean;
  readonly actions: readonly SafetyAction[];
  readonly blockedTraining: readonly BlockedTraining[];
  readonly explanation: string;
}

const abdominalBlocks: readonly BlockedTraining[] = [
  'HEAVY_LOADING',
  'MAXIMAL_BRACING',
  'POWER',
  'PAINFUL_SET_INTENSIFIERS',
];

function immutableResult(result: SafetyResult): SafetyResult {
  return Object.freeze({
    ...result,
    actions: Object.freeze([...result.actions]),
    blockedTraining: Object.freeze([...result.blockedTraining]),
  });
}

export function evaluateSafety(input: SafetyInput): SafetyResult {
  if (!Number.isInteger(input.pain) || input.pain < 0 || input.pain > 10) {
    throw new RangeError('Pain must be an integer from 0 through 10.');
  }

  const blockedTraining = input.abdominalRestrictionActive ? abdominalBlocks : [];

  if ((input.warningFlags?.length ?? 0) > 0) {
    return immutableResult({
      disposition: 'REVIEW_REQUIRED',
      reviewRequired: true,
      actions: ['ABORT_SESSION', 'ENTER_REVIEW_REQUIRED'],
      blockedTraining,
      explanation: 'Suspende la sesión y registra una revisión antes de volver a entrenar.',
    });
  }

  if (input.pain > 4 || input.painTrend === 'acute' || input.painTrend === 'increasing') {
    return immutableResult({
      disposition: 'STOP_PATTERN',
      reviewRequired: false,
      actions: ['STOP_PATTERN'],
      blockedTraining,
      explanation: 'Detén este patrón de movimiento: la molestia supera el límite para continuar o modificar.',
    });
  }

  if (input.persistsAfterModification && input.pain >= 3) {
    return immutableResult({
      disposition: 'STOP_PATTERN',
      reviewRequired: false,
      actions: ['STOP_SET', 'REMOVE_PATTERN_FOR_DAY'],
      blockedTraining,
      explanation: 'Detén la serie y retira este patrón por hoy: la molestia persistió después de una modificación.',
    });
  }

  if (input.pain >= 3 || input.techniqueChanged) {
    return immutableResult({
      disposition: 'MODIFY_SET',
      reviewRequired: false,
      actions: ['STOP_SET', 'REDUCE_LOAD_OR_RANGE_OR_SUBSTITUTE_ONCE'],
      blockedTraining,
      explanation: 'Detén la serie y prueba una sola reducción de carga, cambio de rango o sustitución de ejercicio.',
    });
  }

  if (input.abdominalRestrictionActive) {
    return immutableResult({
      disposition: 'CONTINUE_WITH_RESTRICTIONS',
      reviewRequired: false,
      actions: [],
      blockedTraining,
      explanation: 'Continúa solo dentro de la restricción registrada; se mantienen bloqueados la carga pesada, la presión abdominal máxima, el trabajo de potencia y la intensificación de series dolorosas.',
    });
  }

  return immutableResult({
    disposition: 'CONTINUE_CONSERVATIVELY',
    reviewRequired: false,
    actions: [],
    blockedTraining: [],
    explanation: 'Continúa de forma conservadora mientras la molestia siga estable y la técnica no cambie.',
  });
}
