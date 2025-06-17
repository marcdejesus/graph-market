module.exports = {
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
  globalSetup: '<rootDir>/__tests__/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/globalTeardown.js',

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
      branches: 45,
      functions: 40,
      lines: 55,
      statements: 55,
    },
  },

  // Module path mapping (fixed: should be moduleNameMapper)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Test patterns for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/__tests__/resolvers/**/*.test.js',
        '<rootDir>/__tests__/services/**/*.test.js',
        '<rootDir>/__tests__/models/**/*.test.js',
        '<rootDir>/__tests__/utils/**/*.test.js'
      ],
      transform: {
        '^.+\\.js$': 'babel-jest',
      },
      testEnvironment: 'node',
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.js'],
      transform: {
        '^.+\\.js$': 'babel-jest',
      },
      testEnvironment: 'node',
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