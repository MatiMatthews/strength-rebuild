import { validateLegacyRepairBackup } from '../programs/legacy-repair';
import type { RepositoryDatabase, SqlValue } from '../../data/repositories';
import { decodeBackupFromTransfer } from '../../../plugins/backup-transfer-runtime';
import { decryptBackupEnvelope, encryptBackupEnvelope } from './backup-envelope';

export const BACKUP_VERSION = 1;
export const BACKUP_LIMITS = Object.freeze({
  maxInputBytes: 4 * 1024 * 1024,
  maxDecodedBytes: 16 * 1024 * 1024,
  maxTables: 18,
  maxRowsPerTable: 25_000,
  maxTotalRows: 100_000,
  maxFieldsPerRow: 64,
  maxFieldBytes: 256 * 1024,
  maxJsonNesting: 16,
});
const tables = ['user_profile','equipment_profile','active_restriction','training_max','program_template','cycle','training_week','session_plan','session_exercise','workout_session','set_log','symptom_log','session_note','timer_state','progression_proposal','substitution_decision','decision_log','app_setting'] as const;
type Table = typeof tables[number];
type Row = Record<string, SqlValue>;
interface BackupDocument { version: 1; exportedAt: string; tables: Record<Table, Row[]> }
interface CompactBackupDocument { schemaVersion: 1; exportedAt: string; tables: Record<Table, { columns: string[]; rows: SqlValue[][] }> }
interface CompressedBackupDocument { schemaVersion: 1; encoding: 'lzw24-base64'; payload: string }
interface DenseCompressedBackupDocument { schemaVersion: 1; encoding: 'lzw12-base64'; payload: string }
interface WideCompressedBackupDocument { schemaVersion: 1; encoding: 'lzw18-base64'; payload: string }

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeLzw24(value: string) {
  if (!value || value.length % 4 !== 0) throw new BackupError('corrupt', 'El respaldo comprimido está incompleto.');
  const codes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const digits = [value[index]!, value[index + 1]!, value[index + 2]!, value[index + 3]!].map((character) => BASE64.indexOf(character));
    if (digits.some((digit) => digit < 0)) throw new BackupError('corrupt', 'El respaldo comprimido no es válido.');
    codes.push((digits[0]! << 18) | (digits[1]! << 12) | (digits[2]! << 6) | digits[3]!);
  }
  const dictionary = new Map<number, string>();
  let nextCode = 65_536;
  let phrase = String.fromCharCode(codes[0]!);
  let decoded = phrase;
  for (let index = 1; index < codes.length; index += 1) {
    const code = codes[index]!;
    const entry = code < 65_536 ? String.fromCharCode(code) : dictionary.get(code) ?? (code === nextCode ? phrase + phrase[0] : '');
    if (!entry) throw new BackupError('corrupt', 'El respaldo comprimido no se puede reconstruir.');
    decoded += entry; assertDecodedCharacterBound(decoded); dictionary.set(nextCode++, phrase + entry[0]); phrase = entry;
  }
  assertDecodedBound(decoded); return decoded;
}

function encodeLzw12(value: string) {
  const binary = unescape(encodeURIComponent(value));
  if (!binary) return '';
  const dictionary = new Map<string, number>();
  let nextCode = 256;
  let phrase = binary[0]!;
  const codes: number[] = [];
  for (let index = 1; index < binary.length; index += 1) {
    const character = binary[index]!; const combined = phrase + character;
    if (dictionary.has(combined)) phrase = combined;
    else { codes.push(phrase.length === 1 ? phrase.charCodeAt(0) : dictionary.get(phrase)!); if (nextCode < 4096) dictionary.set(combined, nextCode++); phrase = character; }
  }
  codes.push(phrase.length === 1 ? phrase.charCodeAt(0) : dictionary.get(phrase)!);
  return codes.map((code) => BASE64[(code >>> 6) & 63]! + BASE64[code & 63]!).join('');
}

function decodeLzw12(value: string) {
  if (!value || value.length % 2 !== 0) throw new BackupError('corrupt', 'El respaldo comprimido está incompleto.');
  const codes: number[] = [];
  for (let index = 0; index < value.length; index += 2) {
    const digits = [value[index]!, value[index + 1]!].map((character) => BASE64.indexOf(character));
    if (digits.some((digit) => digit < 0)) throw new BackupError('corrupt', 'El respaldo comprimido no es válido.');
    codes.push((digits[0]! << 6) | digits[1]!);
  }
  const dictionary = new Map<number, string>(); let nextCode = 256;
  let phrase = String.fromCharCode(codes[0]!); let decoded = phrase;
  for (let index = 1; index < codes.length; index += 1) {
    const code = codes[index]!; const entry = code < 256 ? String.fromCharCode(code) : dictionary.get(code) ?? (code === nextCode ? phrase + phrase[0] : '');
    if (!entry) throw new BackupError('corrupt', 'El respaldo comprimido no se puede reconstruir.');
    decoded += entry; assertDecodedCharacterBound(decoded); if (nextCode < 4096) dictionary.set(nextCode++, phrase + entry[0]); phrase = entry;
  }
  const result = decodeURIComponent(escape(decoded)); assertDecodedBound(result); return result;
}

function encodeLzw18(value: string) {
  const binary = unescape(encodeURIComponent(value));
  if (!binary) return '';
  const dictionary = new Map<string, number>(); let nextCode = 256; let phrase = binary[0]!; const codes: number[] = [];
  for (let index = 1; index < binary.length; index += 1) {
    const character = binary[index]!; const combined = phrase + character;
    if (dictionary.has(combined)) phrase = combined;
    else { codes.push(phrase.length === 1 ? phrase.charCodeAt(0) : dictionary.get(phrase)!); if (nextCode < 262_144) dictionary.set(combined, nextCode++); phrase = character; }
  }
  codes.push(phrase.length === 1 ? phrase.charCodeAt(0) : dictionary.get(phrase)!);
  return codes.map((code) => BASE64[(code >>> 12) & 63]! + BASE64[(code >>> 6) & 63]! + BASE64[code & 63]!).join('');
}

function decodeLzw18(value: string) {
  if (!value || value.length % 3 !== 0) throw new BackupError('corrupt', 'El respaldo comprimido está incompleto.');
  const codes: number[] = [];
  for (let index = 0; index < value.length; index += 3) {
    const digits = [value[index]!, value[index + 1]!, value[index + 2]!].map((character) => BASE64.indexOf(character));
    if (digits.some((digit) => digit < 0)) throw new BackupError('corrupt', 'El respaldo comprimido no es válido.');
    codes.push((digits[0]! << 12) | (digits[1]! << 6) | digits[2]!);
  }
  const dictionary = new Map<number, string>(); let nextCode = 256; let phrase = String.fromCharCode(codes[0]!); let decoded = phrase;
  for (let index = 1; index < codes.length; index += 1) {
    const code = codes[index]!; const entry = code < 256 ? String.fromCharCode(code) : dictionary.get(code) ?? (code === nextCode ? phrase + phrase[0] : '');
    if (!entry) throw new BackupError('corrupt', 'El respaldo comprimido no se puede reconstruir.');
    decoded += entry; assertDecodedCharacterBound(decoded); if (nextCode < 262_144) dictionary.set(nextCode++, phrase + entry[0]); phrase = entry;
  }
  const result = decodeURIComponent(escape(decoded)); assertDecodedBound(result); return result;
}

export function compactBackupTransport(raw: string) {
  const document = JSON.parse(raw) as BackupDocument;
  const compactTables = {} as CompactBackupDocument['tables'];
  for (const table of tables) {
    const rows = document.tables[table];
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    compactTables[table] = { columns, rows: rows.map((row) => columns.map((column) => row[column] ?? null)) };
  }
  const compact = JSON.stringify({ schemaVersion: BACKUP_VERSION, exportedAt: document.exportedAt, tables: compactTables } satisfies CompactBackupDocument);
  return JSON.stringify({ schemaVersion: BACKUP_VERSION, encoding: 'lzw18-base64', payload: encodeLzw18(compact) } satisfies WideCompressedBackupDocument);
}

function expandCompactBackup(document: CompactBackupDocument): BackupDocument {
  const expanded = {} as BackupDocument['tables'];
  for (const table of tables) {
    const compact = document.tables?.[table];
    if (!compact || !Array.isArray(compact.columns) || !Array.isArray(compact.rows)) throw new BackupError('corrupt', 'El respaldo compacto está incompleto.');
    expanded[table] = compact.rows.map((values) => Object.fromEntries(compact.columns.map((column, index) => [column, values[index] ?? null])) as Row);
  }
  return { version: BACKUP_VERSION, exportedAt: document.exportedAt, tables: expanded };
}

export class BackupError extends Error {
  constructor(readonly code: 'corrupt' | 'unsupported' | 'rejected' | 'oversized', message: string) { super(message); }
}

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

function assertDecodedCharacterBound(value: string) {
  if (value.length > BACKUP_LIMITS.maxDecodedBytes) throw new BackupError('oversized', 'El respaldo descomprimido supera el límite seguro.');
}

function assertDecodedBound(value: string) {
  if (value.length > BACKUP_LIMITS.maxDecodedBytes || byteLength(value) > BACKUP_LIMITS.maxDecodedBytes) {
    throw new BackupError('oversized', 'El respaldo descomprimido supera el límite seguro.');
  }
}

function jsonDepth(value: unknown, depth = 0): number {
  if (depth > BACKUP_LIMITS.maxJsonNesting) throw new BackupError('oversized', 'El respaldo contiene JSON demasiado anidado.');
  if (!value || typeof value !== 'object') return depth;
  return Math.max(depth, ...Object.values(value as Record<string, unknown>).map((child) => jsonDepth(child, depth + 1)));
}

export function classifyPortableBackup(raw: string): { kind: 'encrypted' } | { kind: 'legacy'; confirmationRequired: true } {
  if (byteLength(raw) > BACKUP_LIMITS.maxInputBytes) throw new BackupError('oversized', 'El respaldo supera el límite de entrada seguro.');
  if (raw.startsWith('SRB2.')) return { kind: 'encrypted' };
  try { JSON.parse(decodeBackupFromTransfer(raw)); } catch { throw new BackupError('corrupt', 'El archivo no contiene JSON válido.'); }
  return { kind: 'legacy', confirmationRequired: true };
}

function parse(raw: string): BackupDocument {
  if (byteLength(raw) > BACKUP_LIMITS.maxInputBytes) throw new BackupError('oversized', 'El respaldo supera el límite de entrada seguro.');
  let value: unknown;
  try { const decoded = decodeBackupFromTransfer(raw); assertDecodedBound(decoded); value = JSON.parse(decoded); } catch (error) { if (error instanceof BackupError) throw error; throw new BackupError('corrupt', 'El archivo no contiene JSON válido.'); }
  if (!value || typeof value !== 'object') throw new BackupError('corrupt', 'El respaldo no es un documento.');
  const compressed = value as Partial<CompressedBackupDocument>;
  if (compressed.encoding === 'lzw24-base64' && typeof compressed.payload !== 'string') throw new BackupError('corrupt', 'El respaldo comprimido está incompleto.');
  const dense = value as Partial<DenseCompressedBackupDocument>;
  if (dense.encoding === 'lzw12-base64' && typeof dense.payload !== 'string') throw new BackupError('corrupt', 'El respaldo comprimido está incompleto.');
  const wide = value as Partial<WideCompressedBackupDocument>;
  if (wide.encoding === 'lzw18-base64' && typeof wide.payload !== 'string') throw new BackupError('corrupt', 'El respaldo comprimido está incompleto.');
  let decodedValue: unknown;
  try { decodedValue = wide.encoding === 'lzw18-base64'
    ? JSON.parse(decodeLzw18(wide.payload!)) as CompactBackupDocument
    : dense.encoding === 'lzw12-base64'
    ? JSON.parse(decodeLzw12(dense.payload!)) as CompactBackupDocument
    : compressed.encoding === 'lzw24-base64' ? JSON.parse(decodeLzw24(compressed.payload!)) as CompactBackupDocument : value; }
  catch (error) { if (error instanceof BackupError) throw error; throw new BackupError('corrupt', 'El respaldo comprimido no contiene JSON válido.'); }
  const candidate = ((decodedValue as Partial<CompactBackupDocument>).schemaVersion === BACKUP_VERSION
    ? expandCompactBackup(decodedValue as CompactBackupDocument)
    : decodedValue) as Partial<BackupDocument>;
  if (candidate.version !== BACKUP_VERSION) throw new BackupError('unsupported', 'La versión del respaldo no es compatible.');
  if (!candidate.tables || typeof candidate.tables !== 'object' || tables.some((table) => !Array.isArray(candidate.tables?.[table]))) throw new BackupError('corrupt', 'El respaldo está incompleto.');
  if (Object.keys(candidate.tables).length > BACKUP_LIMITS.maxTables) throw new BackupError('oversized', 'El respaldo contiene demasiadas tablas.');
  let totalRows = 0;
  for (const table of tables) {
    if (candidate.tables[table].length > BACKUP_LIMITS.maxRowsPerTable) throw new BackupError('oversized', 'Una tabla del respaldo contiene demasiados registros.');
    totalRows += candidate.tables[table].length;
    if (totalRows > BACKUP_LIMITS.maxTotalRows) throw new BackupError('oversized', 'El respaldo contiene demasiados registros.');
    for (const row of candidate.tables[table]) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.values(row).some((item) => !['string','number'].includes(typeof item) && item !== null)) throw new BackupError('corrupt', 'El respaldo contiene registros inválidos.');
    if (Object.keys(row).length > BACKUP_LIMITS.maxFieldsPerRow) throw new BackupError('oversized', 'Un registro del respaldo contiene demasiados campos.');
    if (Object.values(row).some((item) => typeof item === 'string' && byteLength(item) > BACKUP_LIMITS.maxFieldBytes)) throw new BackupError('oversized', 'Un campo del respaldo supera el límite seguro.');
    }
  }
  const document = candidate as BackupDocument;
  validateSemantics(document);
  return document;
}

const relationships: Partial<Record<Table, readonly [string, Table][]>> = {
  equipment_profile: [['user_profile_id', 'user_profile']], active_restriction: [['user_profile_id', 'user_profile']],
  training_max: [['user_profile_id', 'user_profile']], cycle: [['program_template_id', 'program_template']],
  training_week: [['cycle_id', 'cycle']], session_plan: [['training_week_id', 'training_week']],
  session_exercise: [['session_plan_id', 'session_plan']], workout_session: [['session_plan_id', 'session_plan']],
  set_log: [['workout_session_id', 'workout_session'], ['session_exercise_id', 'session_exercise']],
  symptom_log: [['workout_session_id', 'workout_session']], session_note: [['workout_session_id', 'workout_session']],
  timer_state: [['workout_session_id', 'workout_session']], progression_proposal: [['cycle_id', 'cycle']],
  substitution_decision: [['workout_session_id', 'workout_session']],
};

function validateSemantics(document: BackupDocument) {
  try { validateLegacyRepairBackup(document.tables); }
  catch { throw new BackupError('corrupt', 'El respaldo contiene una reparación de referencias inválida o contradictoria.'); }
  const identities = new Map<Table, Set<string>>();
  for (const table of tables) {
    const ids = new Set<string>();
    for (const row of document.tables[table]) {
      if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new BackupError('corrupt', `${table}: identidad duplicada o inválida.`);
      ids.add(row.id);
      if (typeof row.schema_version !== 'number' || !Number.isInteger(row.schema_version) || row.schema_version < 1) throw new BackupError('corrupt', `${table}: versión semántica inválida.`);
      for (const [column, value] of Object.entries(row)) {
        if (column.endsWith('_json') && value !== null) {
          if (typeof value !== 'string') throw new BackupError('corrupt', `${table}.${column}: JSON semántico inválido.`);
          try { jsonDepth(JSON.parse(value)); } catch (error) { if (error instanceof BackupError) throw error; throw new BackupError('corrupt', `${table}.${column}: JSON semántico inválido.`); }
        }
      }
      if (table === 'symptom_log' && (typeof row.severity !== 'number' || row.severity < 0 || row.severity > 10)) throw new BackupError('corrupt', 'symptom_log: severidad fuera de rango.');
      if (table === 'set_log' && row.pain !== null && row.pain !== undefined && (typeof row.pain !== 'number' || row.pain < 0 || row.pain > 10)) throw new BackupError('corrupt', 'set_log: dolor fuera de rango.');
    }
    identities.set(table, ids);
  }
  for (const table of tables) for (const row of document.tables[table]) for (const [column, target] of relationships[table] ?? []) {
    const value = row[column];
    if (value !== null && value !== undefined && (typeof value !== 'string' || !identities.get(target)?.has(value))) throw new BackupError('corrupt', `${table}: relación ${column} inválida.`);
  }
}

export class BackupService {
  constructor(private readonly db: RepositoryDatabase, private readonly now = () => new Date().toISOString()) {}

  async export() {
    const payload = {} as Record<Table, Row[]>;
    for (const table of tables) payload[table] = await this.db.getAllAsync<Row>(`SELECT * FROM ${table} ORDER BY id`);
    return JSON.stringify({ version: BACKUP_VERSION, exportedAt: this.now(), tables: payload } satisfies BackupDocument);
  }

  async exportEncrypted(secret: string) {
    return encryptBackupEnvelope(await this.export(), secret);
  }

  async preview(raw: string) {
    const document = parse(raw); let records = 0; let conflicts = 0;
    for (const table of tables) {
      records += document.tables[table].length;
      const existing = await this.db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
      conflicts += Math.min(existing?.count ?? 0, document.tables[table].length);
    }
    return { version: document.version, exportedAt: document.exportedAt, records, conflicts };
  }

  async previewPortable(raw: string, secret?: string) {
    const classification = classifyPortableBackup(raw);
    if (classification.kind === 'legacy') {
      return { ...(await this.preview(raw)), kind: 'legacy' as const, confirmationRequired: true as const };
    }
    if (!secret) throw new BackupError('rejected', 'Ingresa la contraseña del respaldo cifrado.');
    const plaintext = await this.decryptPortable(raw, secret);
    return { ...(await this.preview(plaintext)), kind: 'encrypted' as const, confirmationRequired: false as const };
  }

  async restorePortable(raw: string, options: { secret?: string; legacyConfirmed?: boolean; replaceConfirmed: boolean }) {
    const classification = classifyPortableBackup(raw);
    if (classification.kind === 'legacy') {
      if (!options.legacyConfirmed) throw new BackupError('rejected', 'Confirma que entiendes que este respaldo heredado no está cifrado ni autenticado.');
      return this.restore(raw, options.replaceConfirmed);
    }
    if (!options.secret) throw new BackupError('rejected', 'Ingresa la contraseña del respaldo cifrado.');
    // Authentication and all structural/resource checks complete before restore
    // performs its first SQLite query or opens the atomic transaction.
    const plaintext = await this.decryptPortable(raw, options.secret);
    parse(plaintext);
    return this.restore(plaintext, options.replaceConfirmed);
  }

  private async decryptPortable(raw: string, secret: string) {
    try { return await decryptBackupEnvelope(raw, secret); }
    catch { throw new BackupError('rejected', 'La contraseña es incorrecta o el respaldo cifrado fue alterado. No se cambió ningún dato.'); }
  }

  async restore(raw: string, confirmed: boolean) {
    const document = parse(raw);
    const current = await Promise.all(tables.map((table) => this.db.getFirstAsync(`SELECT id FROM ${table} LIMIT 1`)));
    if (!confirmed && current.some(Boolean)) throw new BackupError('rejected', 'Confirma el reemplazo de los datos locales.');
    await this.db.withTransactionAsync(async () => {
      for (const table of [...tables].reverse()) await this.db.runAsync(`DELETE FROM ${table}`);
      for (const table of tables) for (const row of document.tables[table]) {
        const columns = Object.keys(row);
        if (!columns.length || columns.some((column) => !/^[a-z_]+$/.test(column))) throw new BackupError('corrupt', 'El respaldo contiene columnas inválidas.');
        await this.db.runAsync(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...columns.map((column) => row[column] ?? null));
      }
    });
  }
}
