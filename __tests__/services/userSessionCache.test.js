import { userSessionCache } from '../../src/services/userSessionCache.js';
import { ensureTestDBConnection, closeTestDBConnection } from '../utils/testDB.js';
import { cache } from '../../src/config/redis.js';

describe('UserSessionCache Service', () => {
  const testUserId = '507f1f77bcf86cd799439011';
  const testTokenHash = 'abc123def456';
  const testIpAddress = '192.168.1.1';
  
  beforeAll(async () => {
    await ensureTestDBConnection();
  });

  afterAll(async () => {
    await closeTestDBConnection();
  });
  
  beforeEach(async () => {
    // Clear cache before each test
    if (cache && cache.isConnected && cache.isConnected()) {
      await cache.flush();
    }
  });
  
  describe('User Session Management', () => {
    test('should set and get user session data', async () => {
      const sessionData = {
        ipAddress: testIpAddress,
        userAgent: 'Mozilla/5.0 Test Browser',
        lastRequest: '/api/graphql',
      };
      
      const setResult = await userSessionCache.setUserSession(testUserId, sessionData);
      expect(setResult).toBe(true);
      
      const retrievedSession = await userSessionCache.getUserSession(testUserId);
      
      expect(retrievedSession).toMatchObject({
        userId: testUserId,
        ipAddress: testIpAddress,
        userAgent: sessionData.userAgent,
        lastRequest: sessionData.lastRequest,
        lastActivity: expect.any(Number),
      });
    });
    
    test('should update last activity on session retrieval', async () => {
      const sessionData = {
        ipAddress: testIpAddress,
        userAgent: 'Test Browser',
      };
      
      await userSessionCache.setUserSession(testUserId, sessionData);
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const session1 = await userSessionCache.getUserSession(testUserId);
      const session2 = await userSessionCache.getUserSession(testUserId);
      
      expect(session2.lastActivity).toBeGreaterThanOrEqual(session1.lastActivity);
    });
    
    test('should return null for non-existent session', async () => {
      const session = await userSessionCache.getUserSession('nonexistent');
      expect(session).toBeNull();
    });
  });
  
  describe('User Profile Caching', () => {
    test('should set and get user profile data', async () => {
      const profileData = {
        _id: testUserId,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'customer',
        password: 'shouldnotbecached', // This should be excluded
      };
      
      const setResult = await userSessionCache.setUserProfile(testUserId, profileData);
      expect(setResult).toBe(true);
      
      const retrievedProfile = await userSessionCache.getUserProfile(testUserId);
      
      expect(retrievedProfile).toMatchObject({
        _id: testUserId,
        email: profileData.email,
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        role: profileData.role,
        cachedAt: expect.any(Number),
      });
      
      // Password should not be cached
      expect(retrievedProfile.password).toBeUndefined();
    });
    
    test('should return null for non-existent profile', async () => {
      const profile = await userSessionCache.getUserProfile('nonexistent');
      expect(profile).toBeNull();
    });
  });
  
  describe('Token Validation Caching', () => {
    test('should set and get token validation data', async () => {
      const userData = {
        userId: testUserId,
        role: 'admin',
        isAdmin: true,
      };
      
      const setResult = await userSessionCache.setTokenValidation(testTokenHash, userData);
      expect(setResult).toBe(true);
      
      const retrievedValidation = await userSessionCache.getTokenValidation(testTokenHash);
      
      expect(retrievedValidation).toMatchObject({
        userId: testUserId,
        role: userData.role,
        isAdmin: userData.isAdmin,
        validatedAt: expect.any(Number),
      });
    });
    
    test('should return null for non-existent token', async () => {
      const validation = await userSessionCache.getTokenValidation('nonexistent');
      expect(validation).toBeNull();
    });
  });
  
  describe('User Order Summary Caching', () => {
    test('should set and get user order summary', async () => {
      const orderSummary = {
        totalOrders: 5,
        recentOrders: [
          { id: 'order1', total: 99.99 },
          { id: 'order2', total: 149.50 },
        ],
        totalSpent: 249.49,
        lastOrderDate: new Date().toISOString(),
      };
      
      const setResult = await userSessionCache.setUserOrderSummary(testUserId, orderSummary);
      expect(setResult).toBe(true);
      
      const retrievedSummary = await userSessionCache.getUserOrderSummary(testUserId);
      
      expect(retrievedSummary).toMatchObject({
        totalOrders: orderSummary.totalOrders,
        recentOrders: orderSummary.recentOrders,
        totalSpent: orderSummary.totalSpent,
        lastOrderDate: orderSummary.lastOrderDate,
        cachedAt: expect.any(Number),
      });
    });
    
    test('should return null for non-existent order summary', async () => {
      const summary = await userSessionCache.getUserOrderSummary('nonexistent');
      expect(summary).toBeNull();
    });
  });
  
  describe('Failed Login Attempts Tracking', () => {
    test('should track and retrieve failed login attempts', async () => {
      const identifier = 'test@example.com';
      
      // Track multiple failed attempts
      const attempt1 = await userSessionCache.trackFailedAttempt(identifier, testIpAddress);
      expect(attempt1).toBe(1);
      
      const attempt2 = await userSessionCache.trackFailedAttempt(identifier, testIpAddress);
      expect(attempt2).toBe(2);
      
      const attempt3 = await userSessionCache.trackFailedAttempt(identifier, testIpAddress);
      expect(attempt3).toBe(3);
      
      // Retrieve failed attempts count
      const failedCount = await userSessionCache.getFailedAttempts(identifier, testIpAddress);
      expect(failedCount).toBe(3);
    });
    
    test('should return 0 for non-existent failed attempts', async () => {
      const failedCount = await userSessionCache.getFailedAttempts('nonexistent', testIpAddress);
      expect(failedCount).toBe(0);
    });
    
    test('should clear failed login attempts', async () => {
      const identifier = 'test@example.com';
      
      // Track some failed attempts
      await userSessionCache.trackFailedAttempt(identifier, testIpAddress);
      await userSessionCache.trackFailedAttempt(identifier, testIpAddress);
      
      // Verify attempts exist
      const beforeClear = await userSessionCache.getFailedAttempts(identifier, testIpAddress);
      expect(beforeClear).toBe(2);
      
      // Clear attempts
      const clearResult = await userSessionCache.clearFailedAttempts(identifier, testIpAddress);
      expect(clearResult).toBe(true);
      
      // Verify attempts are cleared
      const afterClear = await userSessionCache.getFailedAttempts(identifier, testIpAddress);
      expect(afterClear).toBe(0);
    });
    
    test('should track attempts separately by IP address', async () => {
      const identifier = 'test@example.com';
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';
      
      // Track attempts from different IPs
      await userSessionCache.trackFailedAttempt(identifier, ip1);
      await userSessionCache.trackFailedAttempt(identifier, ip1);
      await userSessionCache.trackFailedAttempt(identifier, ip2);
      
      // Check attempts per IP
      const attemptsIp1 = await userSessionCache.getFailedAttempts(identifier, ip1);
      const attemptsIp2 = await userSessionCache.getFailedAttempts(identifier, ip2);
      
      expect(attemptsIp1).toBe(2);
      expect(attemptsIp2).toBe(1);
    });
  });
  
  describe('Active Session Tracking', () => {
    test('should track active sessions count', async () => {
      // Track sessions for multiple users
      await userSessionCache.setUserSession('user1', { ipAddress: testIpAddress });
      await userSessionCache.setUserSession('user2', { ipAddress: testIpAddress });
      await userSessionCache.setUserSession('user3', { ipAddress: testIpAddress });
      
      const activeSessionsCount = await userSessionCache.getActiveSessionsCount();
      expect(activeSessionsCount).toBeGreaterThanOrEqual(3);
    });
    
    test('should handle Redis unavailability gracefully', async () => {
      // Mock Redis unavailability
      const originalRedis = cache.redis;
      Object.defineProperty(cache, 'redis', { 
        value: null, 
        writable: true, 
        configurable: true 
      });
      
      const activeSessionsCount = await userSessionCache.getActiveSessionsCount();
      expect(activeSessionsCount).toBe(0);
      
      // Restore Redis
      Object.defineProperty(cache, 'redis', { 
        value: originalRedis, 
        writable: true, 
        configurable: true 
      });
    });
  });
  
  describe('Cache Invalidation', () => {
    test('should invalidate all user-related cache entries', async () => {
      // Set various cache entries for user
      await userSessionCache.setUserSession(testUserId, { ipAddress: testIpAddress });
      await userSessionCache.setUserProfile(testUserId, { email: 'test@example.com' });
      await userSessionCache.setUserOrderSummary(testUserId, { totalOrders: 5 });
      
      // Verify entries exist
      expect(await userSessionCache.getUserSession(testUserId)).not.toBeNull();
      expect(await userSessionCache.getUserProfile(testUserId)).not.toBeNull();
      expect(await userSessionCache.getUserOrderSummary(testUserId)).not.toBeNull();
      
      // Invalidate user cache
      const result = await userSessionCache.invalidateUserCache(testUserId);
      expect(result).toBe(true);
      
      // Verify entries are removed
      expect(await userSessionCache.getUserSession(testUserId)).toBeNull();
      expect(await userSessionCache.getUserProfile(testUserId)).toBeNull();
      expect(await userSessionCache.getUserOrderSummary(testUserId)).toBeNull();
    });
  });
  
  describe('Cache Statistics', () => {
    test('should provide comprehensive cache statistics', async () => {
      // Set various cache entries
      await userSessionCache.setUserSession('user1', { ipAddress: testIpAddress });
      await userSessionCache.setUserSession('user2', { ipAddress: testIpAddress });
      await userSessionCache.setUserProfile('user1', { email: 'user1@example.com' });
      await userSessionCache.setTokenValidation('token1', { userId: 'user1', role: 'customer' });
      await userSessionCache.setUserOrderSummary('user1', { totalOrders: 3 });
      
      const stats = await userSessionCache.getUserCacheStats();
      
      if (stats) {
        expect(stats).toMatchObject({
          activeSessions: expect.any(Number),
          cachedSessions: expect.any(Number),
          cachedProfiles: expect.any(Number),
          cachedTokens: expect.any(Number),
          cachedOrderSummaries: expect.any(Number),
          totalUserCacheKeys: expect.any(Number),
        });
        
        expect(stats.totalUserCacheKeys).toBeGreaterThan(0);
      }
    });
    
    test('should handle Redis unavailability for statistics', async () => {
      // Mock Redis unavailability
      const originalRedis = cache.redis;
      Object.defineProperty(cache, 'redis', { 
        value: null, 
        writable: true, 
        configurable: true 
      });
      
      const stats = await userSessionCache.getUserCacheStats();
      expect(stats).toBeNull();
      
      // Restore Redis
      Object.defineProperty(cache, 'redis', { 
        value: originalRedis, 
        writable: true, 
        configurable: true 
      });
    });
  });
  
  describe('Error Handling', () => {
    test('should handle cache operation errors gracefully', async () => {
      // Mock cache error
      const originalSet = cache.set;
      cache.set = jest.fn().mockRejectedValue(new Error('Cache error'));
      
      const result = await userSessionCache.setUserSession(testUserId, { ipAddress: testIpAddress });
      expect(result).toBe(false);
      
      // Restore original method
      cache.set = originalSet;
    });
    
    test('should handle cache retrieval errors gracefully', async () => {
      // Mock cache error
      const originalGet = cache.get;
      cache.get = jest.fn().mockRejectedValue(new Error('Cache error'));
      
      const result = await userSessionCache.getUserSession(testUserId);
      expect(result).toBeNull();
      
      // Restore original method
      cache.get = originalGet;
    });
  });
  
  describe('TTL Configuration', () => {
    test('should have appropriate TTL values configured', () => {
      expect(userSessionCache.TTL.USER_SESSION).toBe(1800); // 30 minutes
      expect(userSessionCache.TTL.USER_PROFILE).toBe(3600); // 1 hour
      expect(userSessionCache.TTL.AUTH_TOKEN).toBe(7200); // 2 hours
      expect(userSessionCache.TTL.USER_ORDERS).toBe(900); // 15 minutes
      expect(userSessionCache.TTL.USER_PREFERENCES).toBe(86400); // 24 hours
      expect(userSessionCache.TTL.FAILED_ATTEMPTS).toBe(3600); // 1 hour
    });
    
    test('should have properly configured cache key prefixes', () => {
      expect(userSessionCache.KEYS.USER_SESSION).toBe('session:user');
      expect(userSessionCache.KEYS.USER_PROFILE).toBe('user:profile');
      expect(userSessionCache.KEYS.AUTH_TOKEN).toBe('auth:token');
      expect(userSessionCache.KEYS.USER_ORDERS).toBe('user:orders');
      expect(userSessionCache.KEYS.USER_PREFERENCES).toBe('user:prefs');
      expect(userSessionCache.KEYS.FAILED_ATTEMPTS).toBe('auth:failed');
      expect(userSessionCache.KEYS.ACTIVE_SESSIONS).toBe('sessions:active');
    });
  });
}); 