const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    process.env.EXPO_PUBLIC_SR_E2E_SCENARIOS === '1'
    && moduleName === '@/application/scenario-entry'
  ) {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'tests/e2e/v2.2/scenario-entry.tsx'),
      platform,
    );
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
