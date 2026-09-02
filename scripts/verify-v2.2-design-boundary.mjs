import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const prohibitedLegacyImport = /(?:from\s+['"][^'"]*design-system\/(?:primitives|tokens)['"]|require\(['"][^'"]*design-system\/(?:primitives|tokens)['"]\))/;

export function findLegacyImports(root) {
  const violations = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.[cm]?[jt]sx?$/.test(name) && prohibitedLegacyImport.test(readFileSync(path, 'utf8'))) violations.push(path.slice(root.length + 1));
    }
  };
  for (const directory of ['src/app', 'src/features']) visit(resolve(root, directory));
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(fileURLToPath(new URL('..', import.meta.url)));
  const violations = findLegacyImports(root);
  if (violations.length) throw new Error(`Prohibited legacy design-system imports:\n${violations.join('\n')}`);
  process.stdout.write('V2.2 design boundary verified\n');
}
