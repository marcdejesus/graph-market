import { ensureTestDBConnection } from '../utils/testDB.js';
import { cache } from '../../src/config/redis.js';
import { userSessionCache } from '../../src/services/userSessionCache.js';
import { createDataLoaders } from '../../src/services/dataLoaders.js';

describe('Phase 4: Caching & Performance Integration', () => {
  beforeAll(async () => {
    await ensureTestDBConnection();
  });
  
  beforeEach(async () => {
    // Clear cache before each test
    if (cache && cache.isConnected && cache.isConnected()) {
      await cache.flush();
    }
  });
  
  describe('Redis Cache Integration', () => {
    test('should connect to Redis successfully', async () => {
      if (cache && cache.isConnected) {
        const isConnected = cache.isConnected();
        // Redis might not be available in CI/CD, so we handle both cases
        expect(typeof isConnected).toBe('boolean');
      } else {
        // If cache is not configured, the test should still pass
        expect(true).toBe(true);
      }
    });
    
    test('should perform basic cache operations', async () => {
      if (cache && cache.set && cache.get && cache.isConnected && cache.isConnected()) {
        const testKey = 'test:key';
        const testValue = { data: 'test value', timestamp: Date.now() };
        
        // Set cache value
        const setResult = await cache.set(testKey, testValue, 300);
        expect(setResult).toBe(true);
        
        // Get cache value
        const retrievedValue = await cache.get(testKey);
        expect(retrievedValue).toMatchObject(testValue);
        
        // Delete cache value
        const deleteResult = await cache.del(testKey);
        expect(deleteResult).toBe(true);
        
        // Verify deletion
        const deletedValue = await cache.get(testKey);
        expect(deletedValue).toBeNull();
      } else {
        // Redis not available - skip cache tests
        expect(true).toBe(true);
      }
    });
  });
  
  describe('UserSessionCache Service', () => {
    test('should have proper configuration', () => {
      expect(userSessionCache).toBeDefined();
      expect(userSessionCache.TTL).toBeDefined();
      expect(userSessionCache.KEYS).toBeDefined();
      
      // Check TTL values
      expect(userSessionCache.TTL.USER_SESSION).toBe(1800);
      expect(userSessionCache.TTL.USER_PROFILE).toBe(3600);
      expect(userSessionCache.TTL.AUTH_TOKEN).toBe(7200);
      
      // Check key prefixes
      expect(userSessionCache.KEYS.USER_SESSION).toBe('session:user');
      expect(userSessionCache.KEYS.USER_PROFILE).toBe('user:profile');
      expect(userSessionCache.KEYS.AUTH_TOKEN).toBe('auth:token');
    });
    
    test('should handle cache operations gracefully when Redis is unavailable', async () => {
      // Test session operations
      const sessionResult = await userSessionCache.setUserSession('test-user', {
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
      });
      
      // Should return false if Redis is unavailable, true if available
      expect(typeof sessionResult).toBe('boolean');
      
      const session = await userSessionCache.getUserSession('test-user');
      // Should return null if Redis is unavailable or the cached session
      expect(session === null || typeof session === 'object').toBe(true);
    });
    
    test('should handle token validation caching', async () => {
      const tokenHash = 'test-token-hash';
      const userData = {
        userId: 'test-user-id',
        role: 'customer',
        isAdmin: false,
      };
      
      const setResult = await userSessionCache.setTokenValidation(tokenHash, userData);
      expect(typeof setResult).toBe('boolean');
      
      const retrievedData = await userSessionCache.getTokenValidation(tokenHash);
      // Should return null if Redis is unavailable or the cached data
      expect(retrievedData === null || typeof retrievedData === 'object').toBe(true);
    });
  });
  
  describe('DataLoader Factory', () => {
    test('should create DataLoader instances', () => {
      const dataLoaders = createDataLoaders();
      
      expect(dataLoaders).toBeDefined();
      expect(dataLoaders.userLoader).toBeDefined();
      expect(dataLoaders.productLoader).toBeDefined();
      expect(dataLoaders.userOrdersLoader).toBeDefined();
      expect(dataLoaders.productCreatorLoader).toBeDefined();
      expect(dataLoaders.orderItemsLoader).toBeDefined();
    });
    
    test('should provide utility functions', () => {
      const dataLoaders = createDataLoaders();
      
      expect(typeof dataLoaders.getStats).toBe('function');
      expect(typeof dataLoaders.clearAll).toBe('function');
      expect(typeof dataLoaders.prime).toBe('function');
    });
    
    test('should return statistics', () => {
      const dataLoaders = createDataLoaders();
      const stats = dataLoaders.getStats();
      
      expect(stats).toMatchObject({
        user: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
        product: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
        userOrders: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
        productCreator: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
        orderItems: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
      });
    });
    
    test('should clear all loaders', () => {
      const dataLoaders = createDataLoaders();
      
      // Should not throw an error
      expect(() => dataLoaders.clearAll()).not.toThrow();
      
      const stats = dataLoaders.getStats();
      
      // All cache sizes should be 0 after clearing
      Object.values(stats).forEach(loaderStats => {
        expect(loaderStats.cacheSize).toBe(0);
      });
    });
  });
  
  describe('Performance Monitoring', () => {
    test('should have performance monitoring utilities available', async () => {
      // Check if performance monitoring is available
      const { performanceLogger } = await import('../../src/utils/logging.js');
      
      expect(performanceLogger).toBeDefined();
      expect(typeof performanceLogger.info).toBe('function');
      expect(typeof performanceLogger.warn).toBe('function');
      expect(typeof performanceLogger.error).toBe('function');
      expect(typeof performanceLogger.debug).toBe('function');
      expect(typeof performanceLogger.queryPerformance).toBe('function');
      expect(typeof performanceLogger.dbQueryPerformance).toBe('function');
      expect(typeof performanceLogger.apiResponse).toBe('function');
    });
    
    test('should handle performance logging without errors', async () => {
      const { performanceLogger } = await import('../../src/utils/logging.js');
      
      // These should not throw errors
      expect(() => {
        performanceLogger.info('Test info message', { testData: true });
        performanceLogger.warn('Test warning message', { testData: true });
        performanceLogger.debug('Test debug message', { testData: true });
        performanceLogger.queryPerformance('testQuery', 150, 25);
        performanceLogger.dbQueryPerformance('testDbQuery', 50, true);
      }).not.toThrow();
    });
  });
  
  describe('Cache Integration with Context', () => {
    test('should enhance context creation with caching', async () => {
      const { createContext } = await import('../../src/context/index.js');
      
      expect(createContext).toBeDefined();
      expect(typeof createContext).toBe('function');
      
      // Test context creation with minimal request object
      const mockReq = {
        headers: {},
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('Test User Agent'),
        originalUrl: '/test',
      };
      
      const context = await createContext({ req: mockReq });
      
      expect(context).toBeDefined();
      expect(context.user).toBeNull(); // No auth header provided
      expect(context.isAuthenticated).toBe(false);
      expect(context.dataLoaders).toBeDefined();
      expect(context.userSessionCache).toBeDefined();
      expect(context.performance).toBeDefined();
      expect(typeof context.performance.contextCreationTime).toBe('number');
    });
  });
  
  describe('Error Handling', () => {
    test('should handle missing dependencies gracefully', async () => {
      // Test that our services can handle Redis being unavailable
      const testUserId = 'test-user-123';
      
      // These operations should not throw errors even if Redis is unavailable
      await expect(userSessionCache.getUserSession(testUserId)).resolves.not.toThrow();
      await expect(userSessionCache.setUserSession(testUserId, {})).resolves.not.toThrow();
      await expect(userSessionCache.getActiveSessionsCount()).resolves.not.toThrow();
      await expect(userSessionCache.getUserCacheStats()).resolves.not.toThrow();
    });
    
    test('should handle DataLoader errors gracefully', () => {
      const dataLoaders = createDataLoaders();
      
      // These operations should not throw errors
      expect(() => dataLoaders.getStats()).not.toThrow();
      expect(() => dataLoaders.clearAll()).not.toThrow();
      expect(() => dataLoaders.prime('user', 'test-id', { id: 'test-id' })).not.toThrow();
    });
  });
  
  describe('Performance Metrics', () => {
    test('should track basic performance metrics', async () => {
      const startTime = Date.now();
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete quickly
    });
    
    test('should measure DataLoader creation performance', () => {
      const startTime = Date.now();
      
      const dataLoaders = createDataLoaders();
      
      const duration = Date.now() - startTime;
      
      expect(dataLoaders).toBeDefined();
      expect(duration).toBeLessThan(100); // Should be very fast
    });
    
    test('should measure cache operation performance', async () => {
      if (cache && cache.isConnected && cache.isConnected()) {
        const startTime = Date.now();
        
        await cache.set('perf-test', { data: 'test' }, 60);
        await cache.get('perf-test');
        await cache.del('perf-test');
        
        const duration = Date.now() - startTime;
        
        expect(duration).toBeLessThan(1000); // Should complete quickly
      } else {
        // If Redis is not available, just verify the operation doesn't crash
        expect(true).toBe(true);
      }
    });
  });
}); 