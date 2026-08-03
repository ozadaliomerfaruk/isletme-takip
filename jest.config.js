/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
  setupFiles: ['./jest.setup.ts'],
  setupFilesAfterEnv: ['./jest.console.setup.ts'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.test.tsx',
  ],
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/hooks/**/*.ts',
    '!src/**/*.d.ts',
  ],
  // Baslangic esikleri mevcut olculen seviyenin bilincli olarak biraz altinda.
  // Amac ilk adimda kapsam iddiasi buyutmek degil, sessiz gerilemeyi durdurmak.
  coverageThreshold: {
    global: {
      branches: 26,
      functions: 31,
      lines: 30,
      statements: 29,
    },
  },
};
