import express from 'express';
import { 
  getPerformanceMetrics, 
  healthCheck,
  performanceMetrics 
} from '../middleware/performanceMonitoring.js';
import { cache } from '../config/redis.js';
import { userSessionCache } from '../services/userSessionCache.js';
import { productCacheService } from '../services/productCacheService.js';
import { performanceLogger } from '../utils/logging.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * Public health check endpoint
 */
router.get('/health', healthCheck);

/**
 * Performance metrics endpoint (admin only)
 */
router.get('/metrics', requireAdmin, getPerformanceMetrics);

/**
 * Real-time performance dashboard data (admin only)
 */
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Gather all performance data
    const [
      basicMetrics,
      cacheStats,
      redisInfo,
      systemInfo,
    ] = await Promise.all([
      performanceMetrics.getStats(),
      getCacheStatistics(),
      getRedisInformation(),
      getSystemInformation(),
    ]);
    
    const responseTime = Date.now() - startTime;
    
    const dashboardData = {
      overview: {
        status: 'healthy',
        uptime: process.uptime(),
        responseTime,
        timestamp: Date.now(),
      },
      performance: basicMetrics,
      cache: cacheStats,
      system: systemInfo,
      redis: redisInfo,
    };
    
    res.json({
      success: true,
      data: dashboardData,
    });
    
  } catch (error) {
    performanceLogger.error('Dashboard data error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard data',
    });
  }
});

/**
 * Cache statistics endpoint (admin only)
 */
router.get('/cache', requireAdmin, async (req, res) => {
  try {
    const cacheStats = await getCacheStatistics();
    
    res.json({
      success: true,
      data: cacheStats,
    });
    
  } catch (error) {
    performanceLogger.error('Cache stats error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cache statistics',
    });
  }
});

/**
 * Performance history endpoint (admin only)
 */
router.get('/history', requireAdmin, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const historyData = await getPerformanceHistory(parseInt(days));
    
    res.json({
      success: true,
      data: historyData,
    });
    
  } catch (error) {
    performanceLogger.error('Performance history error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance history',
    });
  }
});

/**
 * Top operations endpoint (admin only)
 */
router.get('/operations', requireAdmin, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const operations = performanceMetrics.getTopOperations(parseInt(limit));
    
    res.json({
      success: true,
      data: {
        operations,
        totalOperationTypes: performanceMetrics.metrics.graphql.operations.size,
        complexQueries: performanceMetrics.metrics.graphql.complexQueries,
      },
    });
    
  } catch (error) {
    performanceLogger.error('Operations stats error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve operations statistics',
    });
  }
});

/**
 * Reset performance metrics (admin only, useful for testing)
 */
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    performanceMetrics.reset();
    
    performanceLogger.info('Performance metrics reset by admin', {
      adminId: req.user?.id,
      ip: req.ip,
    });
    
    res.json({
      success: true,
      message: 'Performance metrics have been reset',
    });
    
  } catch (error) {
    performanceLogger.error('Metrics reset error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to reset performance metrics',
    });
  }
});

/**
 * Cache management endpoints
 */

// Clear specific cache type
router.delete('/cache/:type', requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    let result = false;
    
    switch (type) {
      case 'products':
        result = await cache.deletePattern('product*');
        break;
      case 'users':
        result = await cache.deletePattern('user:*');
        break;
      case 'sessions':
        result = await cache.deletePattern('session:*');
        break;
      case 'all':
        result = await cache.flush();
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid cache type. Use: products, users, sessions, or all',
        });
    }
    
    performanceLogger.info('Cache cleared by admin', {
      cacheType: type,
      adminId: req.user?.id,
      ip: req.ip,
      success: result,
    });
    
    res.json({
      success: result,
      message: result ? `${type} cache cleared successfully` : 'Failed to clear cache',
    });
    
  } catch (error) {
    performanceLogger.error('Cache clear error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
    });
  }
});

// Warm up cache
router.post('/cache/warmup', requireAdmin, async (req, res) => {
  try {
    // This would trigger cache warming for popular data
    // Implementation depends on your specific caching strategy
    
    performanceLogger.info('Cache warmup initiated by admin', {
      adminId: req.user?.id,
      ip: req.ip,
    });
    
    res.json({
      success: true,
      message: 'Cache warmup initiated',
    });
    
  } catch (error) {
    performanceLogger.error('Cache warmup error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to warm up cache',
    });
  }
});

/**
 * Helper functions
 */

async function getCacheStatistics() {
  try {
    const [
      productCacheStats,
      userCacheStats,
      redisConnected,
    ] = await Promise.all([
      productCacheService ? productCacheService.getCacheStats() : null,
      userSessionCache.getUserCacheStats(),
      cache.isConnected(),
    ]);
    
    return {
      redis: {
        connected: redisConnected,
        status: redisConnected ? 'healthy' : 'disconnected',
      },
      products: productCacheStats || { message: 'Product cache service not available' },
      users: userCacheStats || { message: 'User cache stats not available' },
      overall: {
        totalKeys: (productCacheStats?.totalKeys || 0) + (userCacheStats?.totalUserCacheKeys || 0),
        cacheTypes: ['products', 'users', 'sessions', 'tokens'],
      },
    };
  } catch (error) {
    performanceLogger.error('Error gathering cache statistics', { error: error.message });
    return {
      error: 'Failed to gather cache statistics',
      redis: { connected: false, status: 'error' },
    };
  }
}

async function getRedisInformation() {
  try {
    if (!cache.isConnected()) {
      return { connected: false, status: 'disconnected' };
    }
    
    const info = await cache.getInfo();
    
    if (!info) {
      return { connected: true, status: 'limited_info' };
    }
    
    // Parse key Redis metrics from info string
    const metrics = {};
    info.split('\r\n').forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        metrics[key] = value;
      }
    });
    
    return {
      connected: true,
      status: 'healthy',
      memory: {
        used: metrics.used_memory_human || 'unknown',
        peak: metrics.used_memory_peak_human || 'unknown',
        system: metrics.total_system_memory_human || 'unknown',
      },
      connections: {
        current: metrics.connected_clients || 'unknown',
        total: metrics.total_connections_received || 'unknown',
      },
      operations: {
        commands: metrics.total_commands_processed || 'unknown',
        reads: metrics.keyspace_hits || 'unknown',
        misses: metrics.keyspace_misses || 'unknown',
      },
      uptime: metrics.uptime_in_seconds || 'unknown',
    };
  } catch (error) {
    performanceLogger.error('Error getting Redis information', { error: error.message });
    return {
      connected: cache.isConnected(),
      status: 'error',
      error: error.message,
    };
  }
}

function getSystemInformation() {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    node: {
      version: process.version,
      uptime: process.uptime(),
      pid: process.pid,
    },
    memory: {
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
    },
    cpu: {
      user: Math.round(cpuUsage.user / 1000) + 'ms',
      system: Math.round(cpuUsage.system / 1000) + 'ms',
    },
    environment: process.env.NODE_ENV || 'development',
  };
}

async function getPerformanceHistory(days = 7) {
  try {
    const history = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayKey = `performance:daily:${dateStr}`;
      const dayData = await cache.get(dayKey);
      
      if (dayData) {
        history.push({
          date: dateStr,
          ...dayData,
        });
      }
    }
    
    return {
      days: days,
      dataPoints: history.length,
      history: history.reverse(), // Most recent first
    };
  } catch (error) {
    performanceLogger.error('Error getting performance history', { error: error.message });
    return {
      days,
      dataPoints: 0,
      history: [],
      error: error.message,
    };
  }
}

export default router; 