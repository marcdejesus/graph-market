// Test setup utilities - not a test file
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from 'dotenv';

let mongoServer;

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Global test configuration
global.testTimeout = 30000;

// Mock console methods for cleaner test output
const originalConsole = { ...console };
global.console = {
  ...console,
  // Keep important logs
  log: originalConsole.log,
  error: originalConsole.error,
  warn: originalConsole.warn,
  // Suppress debug logs unless needed
  debug: process.env.TEST_DEBUG === 'true' ? originalConsole.debug : jest.fn(),
  info: process.env.TEST_DEBUG === 'true' ? originalConsole.info : jest.fn(),
};

// Mock Redis client for tests that don't specifically test Redis
jest.mock('../src/config/redis.js', () => ({
  cache: process.env.REDIS_URL ? {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    flush: jest.fn(),
    keys: jest.fn(),
    disconnect: jest.fn(),
  } : null,
}));

// Mock file system operations if needed
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Global test utilities
global.testUtils = {
  // Generate test data
  generateTestProduct: (overrides = {}) => ({
    name: 'Test Product',
    description: 'A test product for unit testing',
    category: 'Testing',
    price: 99.99,
    stock: 50,
    isActive: true,
    ...overrides,
  }),

  generateTestUser: (overrides = {}) => ({
    email: 'test@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    role: 'customer',
    ...overrides,
  }),

  // Wait utility for async tests
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Mock GraphQL context
  createMockContext: (user = null) => ({
    user,
    req: {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
      },
    },
    res: {
      setHeader: jest.fn(),
    },
  }),
};

// Performance measurement utilities
global.measurePerformance = {
  start: () => process.hrtime.bigint(),
  end: (start) => Number(process.hrtime.bigint() - start) / 1000000, // Convert to milliseconds
  
  // Helper to measure async operations
  measure: async (operation) => {
    const start = process.hrtime.bigint();
    const result = await operation();
    const duration = Number(process.hrtime.bigint() - start) / 1000000;
    return { result, duration };
  },
};

// Test database configuration
global.dbConfig = {
  // Clean up database collections
  cleanupCollections: async () => {
    if (mongoose.connection.readyState === 1) {
      const collections = await mongoose.connection.db.collections();
      await Promise.all(
        collections.map(collection => collection.deleteMany({}))
      );
    }
  },

  // Create database indexes for testing
  createTestIndexes: async () => {
    if (mongoose.connection.readyState === 1) {
      try {
        // Product indexes
        await mongoose.connection.db.collection('products').createIndex({ category: 1 });
        await mongoose.connection.db.collection('products').createIndex({ price: 1 });
        await mongoose.connection.db.collection('products').createIndex({ stock: 1 });
        await mongoose.connection.db.collection('products').createIndex({ isActive: 1 });
        await mongoose.connection.db.collection('products').createIndex({ createdAt: -1 });
        await mongoose.connection.db.collection('products').createIndex({ 
          name: 'text', 
          description: 'text' 
        });

        // User indexes
        await mongoose.connection.db.collection('users').createIndex({ email: 1 }, { unique: true });
        
        console.log('Test database indexes created');
      } catch (error) {
        console.warn('Some test indexes may already exist:', error.message);
      }
    }
  },
};

// Error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Jest setup hooks
beforeAll(async () => {
  // Increase timeout for setup
  jest.setTimeout(60000);
});

afterEach(async () => {
  // Clear all mocks after each test
  jest.clearAllMocks();
});

// Export setup completion indicator
export const setupComplete = true;

// Setup before all tests
export const setupTestDatabase = async () => {
  try {
    // Create in-memory MongoDB instance with minimal configuration
    mongoServer = await MongoMemoryServer.create({
      binary: {
        version: 'latest'
      }
    });
    const mongoUri = mongoServer.getUri();

    // Connect to the in-memory database
    await mongoose.connect(mongoUri);
  } catch (error) {
    console.error('MongoDB Memory Server setup failed:', error);
    throw error;
  }
};

// Cleanup after all tests
export const teardownTestDatabase = async () => {
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
};

// Clear database between tests
export const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

// Mock environment variables
process.env.JWT_EXPIRES_IN = '7d'; 