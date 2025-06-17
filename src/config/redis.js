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
  }
}; 