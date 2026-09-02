module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/src/test/lucide-react-native.tsx',
  },
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/app/**',
    '!src/**/*.d.ts',
  ],
};
