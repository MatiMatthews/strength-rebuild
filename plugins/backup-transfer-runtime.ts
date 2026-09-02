const CODEPOINT_BASE = 0x3400;

function packValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.startsWith('{') || value.startsWith('[')) {
    try { return `~j${JSON.stringify(packJson(JSON.parse(value)))}`; } catch { /* preserve ordinary text */ }
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return `~u${BigInt(`0x${value.replace(/-/g, '')}`).toString(36)}`;
  }
  return value.startsWith('~') ? `~${value}` : value;
}

function packJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(packJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, packJson(entry)]));
  return packValue(value);
}

function parseBase36(value: string) {
  let result = 0n;
  for (const character of value) result = result * 36n + BigInt(parseInt(character, 36));
  return result;
}

function unpackValue(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith('~')) return value;
  if (value.startsWith('~~')) return value.slice(1);
  if (value.startsWith('~j')) return JSON.stringify(unpackJson(JSON.parse(value.slice(2))));
  if (/^~u[0-9a-z]+$/.test(value)) {
    const hex = parseBase36(value.slice(2)).toString(16).padStart(32, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return value;
}

function unpackJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unpackJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, unpackJson(entry)]));
  return unpackValue(value);
}

function compress(raw: string) {
  const input = unescape(encodeURIComponent(raw));
  const transitions = new Map<string, number>(); let next = 256; let phrase = input[0] ?? ''; const codes: number[] = [];
  for (const character of input.slice(1)) {
    const combined = phrase + character;
    if (transitions.has(combined)) phrase = combined;
    else {
      codes.push(phrase.length === 1 ? phrase.charCodeAt(0) : transitions.get(phrase)!);
      transitions.set(combined, next++);
      if (next === 16384) { transitions.clear(); next = 256; }
      phrase = character;
    }
  }
  if (phrase) codes.push(phrase.length === 1 ? phrase.charCodeAt(0) : transitions.get(phrase)!);
  return codes.map((code) => String.fromCharCode(CODEPOINT_BASE + code)).join('');
}

function decompress(payload: string) {
  const codes = [...payload].map((character) => character.charCodeAt(0) - CODEPOINT_BASE);
  const dictionary = new Map<number, string>(); let next = 256;
  let phrase = String.fromCharCode(codes[0]!); const output = [phrase];
  for (const code of codes.slice(1)) {
    const entry = code < 256 ? String.fromCharCode(code) : dictionary.get(code) ?? (code === next ? phrase + phrase[0]! : '');
    if (!entry) throw new Error('invalid compressed backup');
    output.push(entry); dictionary.set(next++, phrase + entry[0]!);
    if (next === 16384) { dictionary.clear(); next = 256; }
    phrase = entry;
  }
  return decodeURIComponent(escape(output.join('')));
}

export function encodeBackupForTransfer(raw: string) {
  const source = JSON.parse(raw) as { version: number; exportedAt: string; tables: Record<string, Record<string, unknown>[]> };
  const tables = Object.fromEntries(Object.entries(source.tables).map(([table, rows]) => {
    const columns = [...new Set(rows.flatMap(Object.keys))].sort();
    return [table, { columns, rows: rows.map((row) => columns.map((column) => packValue(row[column] ?? null))) }];
  }));
  return JSON.stringify({ schemaVersion: 1, encoding: 'lzw14-cjk', payload: compress(JSON.stringify({ version: source.version, exportedAt: source.exportedAt, tables })) });
}

export function decodeBackupFromTransfer(raw: string) {
  const value = JSON.parse(raw) as { schemaVersion?: number; encoding?: string; payload?: string };
  if (value.encoding !== 'lzw14-cjk') return raw;
  if (value.schemaVersion !== 1 || typeof value.payload !== 'string') throw new Error('invalid compressed backup');
  const packed = JSON.parse(decompress(value.payload)) as { version: number; exportedAt: string; tables: Record<string, { columns: string[]; rows: unknown[][] }> };
  const tables = Object.fromEntries(Object.entries(packed.tables).map(([table, entry]) => [
    table,
    entry.rows.map((row) => Object.fromEntries(entry.columns.map((column, index) => [column, unpackValue(row[index] ?? null)]))),
  ]));
  return JSON.stringify({ version: packed.version, exportedAt: packed.exportedAt, tables });
}
