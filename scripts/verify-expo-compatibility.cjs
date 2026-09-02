#!/usr/bin/env node
const { validateProject } = require('./lib/expo-compatibility.cjs');
const result = validateProject();
process.stdout.write(`Expo candidate compatible: locked ${result.expoVersion}; ${result.checkedModules.length} bundled modules verified.\n`);
