export default {
  // Test environment
  testEnvironment: 'node',

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
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  globalTeardown: '<rootDir>/__tests__/teardown.js',

  // Test timeouts
  testTimeout: 30000, // 30 seconds for regular tests
  
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
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Module path mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Test patterns for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/__tests__/resolvers/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.js'],
    },
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/__tests__/performance/**/*.test.js'],
    },
  ],

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
  detectLeaks: true,

  // Maximum worker processes
  maxWorkers: '50%',

  // Silent console logs during tests (except for performance logs)
  silent: false,

  // Error handling
  errorOnDeprecated: true,

  // Mock patterns
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],
}; 