import { z } from 'zod';

export const MAX_LEGACY_PAYLOAD_LENGTH = 1_000_000;

export type LegacyPayloadErrorCode = 'malformed' | 'invalid' | 'oversized';

export class LegacyPayloadError extends Error {
  constructor(
    readonly code: LegacyPayloadErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LegacyPayloadError';
  }
}

const legacyStateSchema = z
  .object({
    stage: z.string().min(1).max(64),
    view: z.string().min(1).max(64),
    abdominalTrigger: z.boolean(),
    urgentFlag: z.boolean(),
    checks: z.record(z.string().min(1).max(128), z.boolean()),
    pain: z.record(z.string().min(1).max(128), z.string().regex(/^\d+$/)),
    notes: z.record(z.string().min(1).max(128), z.string().max(10_000)),
    timer: z
      .object({
        total: z.number().int().nonnegative().max(86_400),
        remaining: z.number().int().nonnegative().max(86_400),
        end: z.number().nullable(),
        running: z.boolean(),
      })
      .strict(),
  })
  .strict();

export interface LegacyImportPayloadV1 {
  readonly sourceVersion: 1;
  readonly stage: string;
  readonly view: string;
  readonly safety: {
    readonly abdominalTrigger: boolean;
    readonly urgentFlag: boolean;
  };
  readonly checks: Readonly<Record<string, boolean>>;
  readonly pain: Readonly<Record<string, number>>;
  readonly notes: Readonly<Record<string, string>>;
  readonly timerDurationSeconds: number;
}

export function parseLegacyPayload(raw: string): LegacyImportPayloadV1 {
  if (raw.length > MAX_LEGACY_PAYLOAD_LENGTH) {
    throw new LegacyPayloadError('oversized', 'Legacy state exceeds the safe import limit.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (cause) {
    throw new LegacyPayloadError('malformed', 'Legacy state is not valid JSON.', { cause });
  }

  const result = legacyStateSchema.safeParse(decoded);
  if (!result.success) {
    throw new LegacyPayloadError('invalid', 'Legacy state does not match the V1 format.', {
      cause: result.error,
    });
  }

  return {
    sourceVersion: 1,
    stage: result.data.stage,
    view: result.data.view,
    safety: {
      abdominalTrigger: result.data.abdominalTrigger,
      urgentFlag: result.data.urgentFlag,
    },
    checks: result.data.checks,
    pain: Object.fromEntries(
      Object.entries(result.data.pain).map(([key, value]) => [key, Math.min(10, Number(value))]),
    ),
    notes: result.data.notes,
    timerDurationSeconds: result.data.timer.total,
  };
}
