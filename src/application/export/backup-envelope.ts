import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToUtf8, clean, utf8ToBytes } from '@noble/ciphers/utils';
import { scrypt } from '@noble/hashes/scrypt';
import { getRandomBytesAsync } from 'expo-crypto';

const PREFIX = 'SRB2';
const KDF = { name: 'scrypt', N: 16_384, r: 8, p: 1, dkLen: 32 } as const;
type EntropySource = (length: number) => Promise<Uint8Array>;

export class BackupEnvelopeError extends Error {
  constructor(readonly code: 'corrupt' | 'unsupported' | 'rejected', message: string) { super(message); }
}

type EnvelopeMetadata = {
  fmt: 'strength-rebuild-backup';
  v: 1;
  aead: 'xchacha20-poly1305';
  kdf: typeof KDF;
  salt: string;
  nonce: string;
};

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new BackupEnvelopeError('corrupt', 'El respaldo cifrado contiene Base64 inválido.');
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    const decoded = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    if (toBase64Url(decoded) !== value) throw new Error('non-canonical base64');
    return decoded;
  } catch {
    throw new BackupEnvelopeError('corrupt', 'El respaldo cifrado contiene Base64 inválido.');
  }
}

function deriveKey(secret: string, salt: Uint8Array) {
  if (!secret) throw new BackupEnvelopeError('rejected', 'Ingresa la contraseña del respaldo.');
  return scrypt(utf8ToBytes(secret), salt, KDF);
}

function parseMetadata(encoded: string): { metadata: EnvelopeMetadata; bytes: Uint8Array } {
  const bytes = fromBase64Url(encoded);
  let candidate: unknown;
  try { candidate = JSON.parse(bytesToUtf8(bytes)); } catch { throw new BackupEnvelopeError('corrupt', 'Los metadatos del respaldo cifrado no son válidos.'); }
  if (!candidate || typeof candidate !== 'object') throw new BackupEnvelopeError('corrupt', 'Los metadatos del respaldo cifrado no son válidos.');
  const value = candidate as Partial<EnvelopeMetadata>;
  if (value.v !== 1) throw new BackupEnvelopeError('unsupported', 'La versión del respaldo cifrado no es compatible.');
  if (value.fmt !== 'strength-rebuild-backup' || value.aead !== 'xchacha20-poly1305') throw new BackupEnvelopeError('unsupported', 'El algoritmo del respaldo cifrado no es compatible.');
  if (!value.kdf || value.kdf.name !== KDF.name || value.kdf.N !== KDF.N || value.kdf.r !== KDF.r || value.kdf.p !== KDF.p || value.kdf.dkLen !== KDF.dkLen) {
    throw new BackupEnvelopeError('corrupt', 'Los parámetros de derivación del respaldo no son válidos.');
  }
  if (typeof value.salt !== 'string' || typeof value.nonce !== 'string') throw new BackupEnvelopeError('corrupt', 'El respaldo cifrado está incompleto.');
  const salt = fromBase64Url(value.salt); const nonce = fromBase64Url(value.nonce);
  if (salt.length !== 16 || nonce.length !== 24) throw new BackupEnvelopeError('corrupt', 'Los parámetros del respaldo cifrado tienen longitud inválida.');
  return { metadata: value as EnvelopeMetadata, bytes };
}

export async function encryptBackupEnvelope(plaintext: string, secret: string, entropy: EntropySource = getRandomBytesAsync) {
  const salt = await entropy(16); const nonce = await entropy(24);
  if (salt.length !== 16 || nonce.length !== 24) throw new BackupEnvelopeError('corrupt', 'La fuente criptográfica devolvió una longitud inválida.');
  const metadata: EnvelopeMetadata = {
    fmt: 'strength-rebuild-backup', v: 1, aead: 'xchacha20-poly1305', kdf: KDF,
    salt: toBase64Url(salt), nonce: toBase64Url(nonce),
  };
  const metadataBytes = utf8ToBytes(JSON.stringify(metadata));
  const key = deriveKey(secret, salt);
  try {
    const ciphertext = xchacha20poly1305(key, nonce, metadataBytes).encrypt(utf8ToBytes(plaintext));
    return `${PREFIX}.${toBase64Url(metadataBytes)}.${toBase64Url(ciphertext)}`;
  } finally { clean(key); }
}

export async function decryptBackupEnvelope(envelope: string, secret: string) {
  const parts = envelope.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1] || !parts[2]) throw new BackupEnvelopeError('corrupt', 'El respaldo cifrado está truncado o tiene un formato inválido.');
  const { metadata, bytes: metadataBytes } = parseMetadata(parts[1]);
  const salt = fromBase64Url(metadata.salt); const nonce = fromBase64Url(metadata.nonce); const ciphertext = fromBase64Url(parts[2]);
  if (ciphertext.length < 16) throw new BackupEnvelopeError('corrupt', 'El respaldo cifrado está truncado.');
  const key = deriveKey(secret, salt);
  try {
    return bytesToUtf8(xchacha20poly1305(key, nonce, metadataBytes).decrypt(ciphertext));
  } catch {
    throw new BackupEnvelopeError('corrupt', 'La contraseña es incorrecta o el respaldo fue alterado.');
  } finally { clean(key); }
}
