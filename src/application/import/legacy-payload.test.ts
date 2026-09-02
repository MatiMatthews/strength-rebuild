import emptyFixture from '../../../tests/fixtures/legacy/empty.json';
import protectedFixture from '../../../tests/fixtures/legacy/protected.json';
import representativeFixture from '../../../tests/fixtures/legacy/representative.json';

import { LegacyPayloadError, parseLegacyPayload } from './legacy-payload';

describe('parseLegacyPayload', () => {
  it('transforms representative V1 state into a versioned import payload', () => {
    expect(parseLegacyPayload(JSON.stringify(representativeFixture))).toEqual({
      sourceVersion: 1,
      stage: 'w2',
      view: 'lunes',
      safety: { abdominalTrigger: false, urgentFlag: false },
      checks: representativeFixture.checks,
      pain: { 'lunes-before': 1, 'lunes-after': 2 },
      notes: representativeFixture.notes,
      timerDurationSeconds: 180,
    });
  });

  it('preserves active safety restrictions without interpreting them medically', () => {
    expect(parseLegacyPayload(JSON.stringify(protectedFixture)).safety).toEqual({
      abdominalTrigger: true,
      urgentFlag: false,
    });
  });

  it.each([
    ['empty', JSON.stringify(emptyFixture), 'invalid'],
    ['malformed', '{"stage":"w2","checks":', 'malformed'],
    ['oversized', 'x'.repeat(1_000_001), 'oversized'],
  ])('rejects %s V1 input with a recoverable typed error', (_name, raw, code) => {
    expect(() => parseLegacyPayload(raw)).toThrow(LegacyPayloadError);
    try {
      parseLegacyPayload(raw);
    } catch (error) {
      expect(error).toMatchObject({ code });
    }
  });

  it('rejects invalid field types instead of coercing or inventing values', () => {
    expect(() =>
      parseLegacyPayload(
        JSON.stringify({ ...representativeFixture, abdominalTrigger: 'false' }),
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid' }));
  });
});
