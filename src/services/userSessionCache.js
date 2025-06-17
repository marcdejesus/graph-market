import { cache } from '../config/redis.js';
import { performanceLogger } from '../utils/logging.js';

/**
 * User Session Caching Service
 * Provides intelligent caching for user sessions, authentication, and profile data
 */
export class UserSessionCache {
  constructor() {
    // Cache TTL configurations (in seconds)
    this.TTL = {
      USER_SESSION: 1800, // 30 minutes for active sessions
      USER_PROFILE: 3600, // 1 hour for user profile data
      AUTH_TOKEN: 7200, // 2 hours for token validation
      USER_ORDERS: 900, // 15 minutes for user order summaries
      USER_PREFERENCES: 86400, // 24 hours for user preferences
      FAILED_ATTEMPTS: 3600, // 1 hour for failed login tracking
    };

    // Cache key prefixes
    this.KEYS = {
      USER_SESSION: 'session:user',
      USER_PROFILE: 'user:profile',
      AUTH_TOKEN: 'auth:token',
      USER_ORDERS: 'user:orders',
      USER_PREFERENCES: 'user:prefs',
      FAILED_ATTEMPTS: 'auth:failed',
      ACTIVE_SESSIONS: 'sessions:active',
    };
  }

  /**
   * Cache user session data
   */
  async setUserSession(userId, sessionData) {
    // Return false if cache is not available
    if (!cache || !cache.set) {
      return false;
    }
    
    const key = `${this.KEYS.USER_SESSION}:${userId}`;
    
    try {
      // Store session data
      await cache.set(key, {
        userId,
        lastActivity: Date.now(),
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
        ...sessionData,
      }, this.TTL.USER_SESSION);

      // Track active sessions
      await this.trackActiveSession(userId);
      
      try { performanceLogger.cacheSet(key, 'userSession'); } catch (e) {}
      return true;
    } catch (error) {
      console.error('Cache set error for user session:', error);
      return false;
    }
  }

  /**
   * Get cached user session
   */
  async getUserSession(userId) {
    // Return null if cache is not available
    if (!cache || !cache.get) {
      return null;
    }
    
    const key = `${this.KEYS.USER_SESSION}:${userId}`;
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        // Update last activity
        cached.lastActivity = Date.now();
        await cache.set(key, cached, this.TTL.USER_SESSION);
        
        try { performanceLogger.cacheHit(key, 'userSession'); } catch (e) {}
        return cached;
      }
      
      try { performanceLogger.cacheMiss(key, 'userSession'); } catch (e) {}
      return null;
    } catch (error) {
      console.error('Cache get error for user session:', error);
      return null;
    }
  }

  /**
   * Cache user profile data
   */
  async setUserProfile(userId, profileData) {
    // Return false if cache is not available
    if (!cache || !cache.set) {
      return false;
    }
    
    const key = `${this.KEYS.USER_PROFILE}:${userId}`;
    
    try {
      await cache.set(key, {
        ...profileData,
        password: undefined, // Never cache passwords
        cachedAt: Date.now(),
      }, this.TTL.USER_PROFILE);
      
      try { performanceLogger.cacheSet(key, 'userProfile'); } catch (e) {}
      return true;
    } catch (error) {
      console.error('Cache set error for user profile:', error);
      return false;
    }
  }

  /**
   * Get cached user profile
   */
  async getUserProfile(userId) {
    // Return null if cache is not available
    if (!cache || !cache.get) {
      return null;
    }
    
    const key = `${this.KEYS.USER_PROFILE}:${userId}`;
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        try { performanceLogger.cacheHit(key, 'userProfile'); } catch (e) {}
        return cached;
      }
      
      try { performanceLogger.cacheMiss(key, 'userProfile'); } catch (e) {}
      return null;
    } catch (error) {
      console.error('Cache get error for user profile:', error);
      return null;
    }
  }

  /**
   * Cache authentication token validation
   */
  async setTokenValidation(tokenHash, userData) {
    // Return false if cache is not available
    if (!cache || !cache.set) {
      return false;
    }
    
    const key = `${this.KEYS.AUTH_TOKEN}:${tokenHash}`;
    
    try {
      await cache.set(key, {
        userId: userData.userId,
        role: userData.role,
        isAdmin: userData.isAdmin,
        validatedAt: Date.now(),
      }, this.TTL.AUTH_TOKEN);
      
      return true;
    } catch (error) {
      console.error('Cache set error for token validation:', error);
      return false;
    }
  }

  /**
   * Get cached token validation
   */
  async getTokenValidation(tokenHash) {
    // Return null if cache is not available
    if (!cache || !cache.get) {
      return null;
    }
    
    const key = `${this.KEYS.AUTH_TOKEN}:${tokenHash}`;
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        try { performanceLogger.cacheHit(key, 'tokenValidation'); } catch (e) {}
        return cached;
      }
      
      try { performanceLogger.cacheMiss(key, 'tokenValidation'); } catch (e) {}
      return null;
    } catch (error) {
      console.error('Cache get error for token validation:', error);
      return null;
    }
  }

  /**
   * Cache user order summary
   */
  async setUserOrderSummary(userId, orderSummary) {
    // Return false if cache is not available
    if (!cache || !cache.set) {
      return false;
    }
    
    const key = `${this.KEYS.USER_ORDERS}:${userId}`;
    
    try {
      await cache.set(key, {
        totalOrders: orderSummary.totalOrders,
        recentOrders: orderSummary.recentOrders,
        totalSpent: orderSummary.totalSpent,
        lastOrderDate: orderSummary.lastOrderDate,
        cachedAt: Date.now(),
      }, this.TTL.USER_ORDERS);
      
      return true;
    } catch (error) {
      console.error('Cache set error for user order summary:', error);
      return false;
    }
  }

  /**
   * Get cached user order summary
   */
  async getUserOrderSummary(userId) {
    // Return null if cache is not available
    if (!cache || !cache.get) {
      return null;
    }
    
    const key = `${this.KEYS.USER_ORDERS}:${userId}`;
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        try { performanceLogger.cacheHit(key, 'userOrderSummary'); } catch (e) {}
        return cached;
      }
      
      try { performanceLogger.cacheMiss(key, 'userOrderSummary'); } catch (e) {}
      return null;
    } catch (error) {
      console.error('Cache get error for user order summary:', error);
      return null;
    }
  }

  /**
   * Track failed login attempts
   */
  async trackFailedAttempt(identifier, ipAddress) {
    // Return 0 if cache is not available
    if (!cache || !cache.get || !cache.set) {
      return 0;
    }
    
    const key = `${this.KEYS.FAILED_ATTEMPTS}:${identifier}:${ipAddress}`;
    
    try {
      const current = await cache.get(key) || { attempts: 0, firstAttempt: Date.now() };
      current.attempts += 1;
      current.lastAttempt = Date.now();
      
      await cache.set(key, current, this.TTL.FAILED_ATTEMPTS);
      return current.attempts;
    } catch (error) {
      console.error('Cache error for failed attempts tracking:', error);
      return 0;
    }
  }

  /**
   * Get failed login attempts count
   */
  async getFailedAttempts(identifier, ipAddress) {
    // Return 0 if cache is not available
    if (!cache || !cache.get) {
      return 0;
    }
    
    const key = `${this.KEYS.FAILED_ATTEMPTS}:${identifier}:${ipAddress}`;
    
    try {
      const cached = await cache.get(key);
      return cached ? cached.attempts : 0;
    } catch (error) {
      console.error('Cache get error for failed attempts:', error);
      return 0;
    }
  }

  /**
   * Clear failed login attempts
   */
  async clearFailedAttempts(identifier, ipAddress) {
    // Return false if cache is not available
    if (!cache || !cache.del) {
      return false;
    }
    
    const key = `${this.KEYS.FAILED_ATTEMPTS}:${identifier}:${ipAddress}`;
    
    try {
      await cache.del(key);
      return true;
    } catch (error) {
      console.error('Cache del error for failed attempts:', error);
      return false;
    }
  }

  /**
   * Track active session
   */
  async trackActiveSession(userId) {
    // Return early if cache is not available
    if (!cache || !cache.redis) {
      return;
    }
    
    const key = this.KEYS.ACTIVE_SESSIONS;
    
    try {
      // Use Redis set for active session tracking
      const redis = cache.redis;
      if (redis) {
        await redis.sadd(key, userId);
        await redis.expire(key, this.TTL.USER_SESSION);
      }
    } catch (error) {
      console.error('Error tracking active session:', error);
    }
  }

  /**
   * Get active sessions count
   */
  async getActiveSessionsCount() {
    // Return 0 if cache is not available
    if (!cache || !cache.redis) {
      return 0;
    }
    
    const key = this.KEYS.ACTIVE_SESSIONS;
    
    try {
      const redis = cache.redis;
      if (redis) {
        return await redis.scard(key);
      }
      return 0;
    } catch (error) {
      console.error('Error getting active sessions count:', error);
      return 0;
    }
  }

  /**
   * Invalidate user cache when profile changes
   */
  async invalidateUserCache(userId) {
    // Return false if cache is not available
    if (!cache || !cache.del) {
      return false;
    }
    
    const keysToDelete = [
      `${this.KEYS.USER_SESSION}:${userId}`,
      `${this.KEYS.USER_PROFILE}:${userId}`,
      `${this.KEYS.USER_ORDERS}:${userId}`,
      `${this.KEYS.USER_PREFERENCES}:${userId}`,
    ];
    
    try {
      await Promise.all(keysToDelete.map(key => cache.del(key)));
      
      // Remove from active sessions
      const redis = cache.redis;
      if (redis) {
        await redis.srem(this.KEYS.ACTIVE_SESSIONS, userId);
      }
      
      return true;
    } catch (error) {
      console.error('Error invalidating user cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getUserCacheStats() {
    // Return null if cache is not available
    if (!cache || !cache.redis) {
      return null;
    }
    
    try {
      const redis = cache.redis;
      if (!redis) return null;

      const [
        sessionKeys,
        profileKeys,
        tokenKeys,
        orderKeys,
        activeSessionsCount,
      ] = await Promise.all([
        redis.keys(`${this.KEYS.USER_SESSION}:*`),
        redis.keys(`${this.KEYS.USER_PROFILE}:*`),
        redis.keys(`${this.KEYS.AUTH_TOKEN}:*`),
        redis.keys(`${this.KEYS.USER_ORDERS}:*`),
        this.getActiveSessionsCount(),
      ]);

      return {
        activeSessions: activeSessionsCount,
        cachedSessions: sessionKeys.length,
        cachedProfiles: profileKeys.length,
        cachedTokens: tokenKeys.length,
        cachedOrderSummaries: orderKeys.length,
        totalUserCacheKeys: sessionKeys.length + profileKeys.length + tokenKeys.length + orderKeys.length,
      };
    } catch (error) {
      console.error('Error getting user cache stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export const userSessionCache = new UserSessionCache(); 