import Redis from 'ioredis';

let redis = null;

export const connectRedis = async () => {
  try {
    const redisUri = process.env.REDIS_URI || 'redis://localhost:6379';
    
    redis = new Redis(redisUri, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    redis.on('connect', () => {
      console.log('✅ Redis Connected');
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redis.on('close', () => {
      console.log('Redis connection closed');
    });

    // Test connection
    await redis.ping();

  } catch (error) {
    console.error('Error connecting to Redis:', error.message);
    // Don't exit process for Redis errors - the app can work without caching
    redis = null;
  }
};

export const getRedisClient = () => redis;

export const cache = {
  // Expose Redis client for advanced operations
  get redis() {
    return redis;
  },

  async get(key) {
    if (!redis) return null;
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  },

  async set(key, value, ttl = 3600) {
    if (!redis) return false;
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  },

  async del(key) {
    if (!redis) return false;
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('Redis del error:', error);
      return false;
    }
  },

  async flush() {
    if (!redis) return false;
    try {
      await redis.flushall();
      return true;
    } catch (error) {
      console.error('Redis flush error:', error);
      return false;
    }
  },

  // Multi-get for batch operations (DataLoader support)
  async mget(keys) {
    if (!redis || !keys.length) return [];
    try {
      const values = await redis.mget(...keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      console.error('Redis mget error:', error);
      return new Array(keys.length).fill(null);
    }
  },

  // Multi-set for batch operations
  async mset(keyValuePairs, ttl = 3600) {
    if (!redis || !keyValuePairs.length) return false;
    try {
      const pipeline = redis.pipeline();
      
      for (const [key, value] of keyValuePairs) {
        pipeline.setex(key, ttl, JSON.stringify(value));
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Redis mset error:', error);
      return false;
    }
  },

  // Check if Redis is connected
  isConnected() {
    return redis && redis.status === 'ready';
  },

  // Get Redis connection info
  async getInfo() {
    if (!redis) return null;
    try {
      return await redis.info();
    } catch (error) {
      console.error('Redis info error:', error);
      return null;
    }
  },

  // Pattern-based key deletion
  async deletePattern(pattern) {
    if (!redis) return false;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Redis delete pattern error:', error);
      return false;
    }
  }
}; 