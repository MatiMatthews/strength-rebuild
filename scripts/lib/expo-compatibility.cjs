const { readFileSync } = require('node:fs');
const path = require('node:path');

function fail(marker) { throw new Error(`EXPO_COMPATIBILITY_${marker}`); }

function satisfies(version, range) {
  const clean = String(range).trim();
  if (/^\d+\.\d+\.\d+$/.test(clean)) return version === clean;
  const match = clean.match(/^([~^])(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [, operator, major, minor, patch] = match;
  const actual = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!actual) return false;
  const [, aMajor, aMinor, aPatch] = actual;
  if (aMajor !== major) return false;
  if (operator === '~' && aMinor !== minor) return false;
  if (Number(aMinor) < Number(minor)) return false;
  return aMinor !== minor || Number(aPatch) >= Number(patch);
}

function validateExpoCompatibility(input) {
  const manifestDeps = input.manifest?.dependencies || {};
  const lockPackages = input.lockfile?.packages || {};
  const lockDeps = lockPackages['']?.dependencies || {};
  if (!manifestDeps.expo || manifestDeps.expo !== lockDeps.expo) fail('MANIFEST_LOCK_EXPO');
  const lockedExpo = lockPackages['node_modules/expo']?.version;
  if (!lockedExpo || lockedExpo !== input.installedExpoVersion || !satisfies(lockedExpo, manifestDeps.expo)) {
    fail('INSTALLED_EXPO');
  }

  const checkedModules = [];
  for (const [name, bundledRange] of Object.entries(input.bundledNativeModules || {})) {
    if (!(name in manifestDeps)) continue;
    if (manifestDeps[name] !== lockDeps[name]) fail('MANIFEST_LOCK_MODULE');
    const locked = lockPackages[`node_modules/${name}`]?.version;
    const installed = input.installedVersions[name];
    if (!locked || locked !== installed || !satisfies(installed, manifestDeps[name]) || !satisfies(installed, bundledRange)) {
      fail('BUNDLED_MODULE');
    }
    checkedModules.push(name);
  }
  return { ok: true, expoVersion: lockedExpo, checkedModules: checkedModules.sort() };
}

function validateProject(root = process.cwd()) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const expoRoot = path.join(root, 'node_modules', 'expo');
  const installedExpoVersion = JSON.parse(readFileSync(path.join(expoRoot, 'package.json'), 'utf8')).version;
  const bundledNativeModules = JSON.parse(readFileSync(path.join(expoRoot, 'bundledNativeModules.json'), 'utf8'));
  const installedVersions = {};
  for (const name of Object.keys(bundledNativeModules)) {
    if (manifest.dependencies?.[name]) {
      installedVersions[name] = JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
    }
  }
  return validateExpoCompatibility({ manifest, lockfile, installedExpoVersion, installedVersions, bundledNativeModules });
}

module.exports = { satisfies, validateExpoCompatibility, validateProject };
