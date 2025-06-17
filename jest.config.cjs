module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Set environment variables for tests
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // Module system
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  // Test files and directories
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Setup and teardown
  globalSetup: '<rootDir>/__tests__/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/globalTeardown.js',

  // Test timeouts
  testTimeout: 45000, // 45 seconds for all tests
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/config/**',
    '!src/**/*.test.js',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  // Module path mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Maximum worker processes
  maxWorkers: '50%',

  // Silent console logs during tests
  silent: false,

  // Error handling
  errorOnDeprecated: true,

  // Mock patterns
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],
}; 