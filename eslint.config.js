const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'android/**',
      'ios/**',
      'dist/**',
      'coverage/**',
      '.android-user/**',
      '.gradle-user-home/**',
      '.gradle/**',
      'legacy/**',
      'playwright-report/**',
      'test-results/**',
      'toolchain/**',
    ],
  },
]);
