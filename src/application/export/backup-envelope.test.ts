import { decryptBackupEnvelope, encryptBackupEnvelope } from './backup-envelope';

const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
const nonce = Uint8Array.from({ length: 24 }, (_, index) => index + 16);
const entropy = async (length: number) => length === 16 ? salt : nonce;

describe('authenticated backup envelope', () => {
  it('matches the documented deterministic adapter vector and round-trips Unicode', async () => {
    const plaintext = '{"athlete":"Matías","pain":7}';
    const envelope = await encryptBackupEnvelope(plaintext, 'correct horse battery staple', entropy);

    expect(envelope).toBe('SRB2.eyJmbXQiOiJzdHJlbmd0aC1yZWJ1aWxkLWJhY2t1cCIsInYiOjEsImFlYWQiOiJ4Y2hhY2hhMjAtcG9seTEzMDUiLCJrZGYiOnsibmFtZSI6InNjcnlwdCIsIk4iOjE2Mzg0LCJyIjo4LCJwIjoxLCJka0xlbiI6MzJ9LCJzYWx0IjoiQUFFQ0F3UUZCZ2NJQ1FvTERBME9EdyIsIm5vbmNlIjoiRUJFU0V4UVZGaGNZR1JvYkhCMGVIeUFoSWlNa0pTWW4ifQ.cFYEI9UbLksWDmjdQH5oohl9BYJNBEATOxgrkg6JylrhPXsH9xjwI--1pXCMnQ');
    await expect(decryptBackupEnvelope(envelope, 'correct horse battery staple')).resolves.toBe(plaintext);
    expect(envelope).not.toContain('Matías');
    expect(envelope).not.toContain('pain');
  });

  it.each(['wrong secret', 'tampered ciphertext', 'truncated ciphertext'])(
    'fails closed for %s',
    async (failure) => {
      const envelope = await encryptBackupEnvelope('{"private":"symptom"}', 'secret', entropy);
      const candidate = failure === 'tampered ciphertext'
        ? `${envelope.slice(0, -1)}${envelope.endsWith('A') ? 'B' : 'A'}`
        : failure === 'truncated ciphertext' ? envelope.slice(0, -8) : envelope;
      await expect(decryptBackupEnvelope(candidate, failure === 'wrong secret' ? 'wrong' : 'secret'))
        .rejects.toMatchObject({ code: 'corrupt' });
    },
  );

  it('rejects unsupported versions and malformed KDF parameters before decryption', async () => {
    const envelope = await encryptBackupEnvelope('{}', 'secret', entropy);
    const [, metadata, ciphertext] = envelope.split('.');
    const decoded = JSON.parse(Buffer.from(metadata!, 'base64url').toString('utf8')) as Record<string, unknown>;
    const unsupported = `SRB2.${Buffer.from(JSON.stringify({ ...decoded, v: 2 })).toString('base64url')}.${ciphertext}`;
    const malformed = `SRB2.${Buffer.from(JSON.stringify({ ...decoded, kdf: { name: 'scrypt', N: 3, r: 8, p: 1, dkLen: 32 } })).toString('base64url')}.${ciphertext}`;

    await expect(decryptBackupEnvelope(unsupported, 'secret')).rejects.toMatchObject({ code: 'unsupported' });
    await expect(decryptBackupEnvelope(malformed, 'secret')).rejects.toMatchObject({ code: 'corrupt' });
  });
});
