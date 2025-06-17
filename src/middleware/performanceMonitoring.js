import { performanceLogger } from '../utils/logging.js';
import { cache } from '../config/redis.js';

/**
 * Performance Monitoring Middleware
 * Tracks response times, cache metrics, database performance, and error rates
 */

// In-memory performance metrics store (in production, use Redis or dedicated metrics service)
class PerformanceMetrics {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        errors: 0,
        responseTimes: [],
        slowQueries: 0,
      },
      cache: {
        hits: 0,
        misses: 0,
        operations: 0,
      },
      database: {
        queries: 0,
        queryTimes: [],
        slowQueries: 0,
        connections: 0,
      },
      graphql: {
        operations: new Map(),
        complexQueries: 0,
        errors: new Map(),
      },
    };
    
    this.thresholds = {
      slowResponse: 1000, // 1 second
      slowQuery: 500, // 500ms
      complexQuery: 10, // depth
    };
    
    // Clean up old metrics every hour
    setInterval(() => this.cleanup(), 3600000);
  }

  recordRequest(duration, success = true) {
    this.metrics.requests.total++;
    this.metrics.requests.responseTimes.push(duration);
    
    if (!success) {
      this.metrics.requests.errors++;
    }
    
    if (duration > this.thresholds.slowResponse) {
      this.metrics.requests.slowQueries++;
    }
    
    // Keep only last 1000 response times for memory efficiency
    if (this.metrics.requests.responseTimes.length > 1000) {
      this.metrics.requests.responseTimes = this.metrics.requests.responseTimes.slice(-500);
    }
  }

  recordCacheOperation(operation, hit = true) {
    this.metrics.cache.operations++;
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }
  }

  recordDatabaseQuery(duration) {
    this.metrics.database.queries++;
    this.metrics.database.queryTimes.push(duration);
    
    if (duration > this.thresholds.slowQuery) {
      this.metrics.database.slowQueries++;
    }
    
    // Keep only last 1000 query times
    if (this.metrics.database.queryTimes.length > 1000) {
      this.metrics.database.queryTimes = this.metrics.database.queryTimes.slice(-500);
    }
  }

  recordGraphQLOperation(operationName, duration, complexity = 0, success = true) {
    if (!this.metrics.graphql.operations.has(operationName)) {
      this.metrics.graphql.operations.set(operationName, {
        count: 0,
        totalDuration: 0,
        errors: 0,
        avgComplexity: 0,
      });
    }
    
    const operation = this.metrics.graphql.operations.get(operationName);
    operation.count++;
    operation.totalDuration += duration;
    operation.avgComplexity = (operation.avgComplexity + complexity) / 2;
    
    if (!success) {
      operation.errors++;
    }
    
    if (complexity > this.thresholds.complexQuery) {
      this.metrics.graphql.complexQueries++;
    }
  }

  getStats() {
    const { requests, cache, database, graphql } = this.metrics;
    
    // Calculate averages
    const avgResponseTime = requests.responseTimes.length > 0 
      ? requests.responseTimes.reduce((a, b) => a + b, 0) / requests.responseTimes.length 
      : 0;
      
    const avgDbQueryTime = database.queryTimes.length > 0
      ? database.queryTimes.reduce((a, b) => a + b, 0) / database.queryTimes.length
      : 0;
    
    const cacheHitRate = cache.operations > 0 
      ? (cache.hits / cache.operations * 100) 
      : 0;
      
    const errorRate = requests.total > 0 
      ? (requests.errors / requests.total * 100) 
      : 0;

    return {
      requests: {
        total: requests.total,
        errors: requests.errors,
        errorRate: Math.round(errorRate * 100) / 100,
        avgResponseTime: Math.round(avgResponseTime),
        slowRequests: requests.slowQueries,
      },
      cache: {
        hits: cache.hits,
        misses: cache.misses,
        hitRate: Math.round(cacheHitRate * 100) / 100,
        operations: cache.operations,
      },
      database: {
        queries: database.queries,
        avgQueryTime: Math.round(avgDbQueryTime),
        slowQueries: database.slowQueries,
      },
      graphql: {
        operationCount: graphql.operations.size,
        complexQueries: graphql.complexQueries,
        topOperations: this.getTopOperations(),
      },
      timestamp: Date.now(),
    };
  }

  getTopOperations(limit = 10) {
    return Array.from(this.metrics.graphql.operations.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, limit)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        avgDuration: Math.round(stats.totalDuration / stats.count),
        errorRate: Math.round((stats.errors / stats.count) * 100 * 100) / 100,
        avgComplexity: Math.round(stats.avgComplexity * 100) / 100,
      }));
  }

  cleanup() {
    // Reset counters but keep historical averages
    const stats = this.getStats();
    
    // Store daily stats in cache for historical tracking
    const dailyKey = `performance:daily:${new Date().toISOString().split('T')[0]}`;
    cache.set(dailyKey, stats, 86400 * 7); // Keep for 7 days
    
    // Reset metrics for new period
    this.metrics.requests.responseTimes = [];
    this.metrics.database.queryTimes = [];
    
    performanceLogger.info('Performance metrics cleaned up', { 
      preservedStats: stats 
    });
  }

  reset() {
    this.metrics = {
      requests: { total: 0, errors: 0, responseTimes: [], slowQueries: 0 },
      cache: { hits: 0, misses: 0, operations: 0 },
      database: { queries: 0, queryTimes: [], slowQueries: 0, connections: 0 },
      graphql: { operations: new Map(), complexQueries: 0, errors: new Map() },
    };
  }
}

// Global metrics instance
export const performanceMetrics = new PerformanceMetrics();

/**
 * Express middleware for request performance monitoring
 */
export const requestPerformanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Add performance context to request
  req.performance = {
    startTime,
    dbQueries: 0,
    cacheOperations: 0,
  };
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const success = res.statusCode < 400;
    
    // Record request metrics
    performanceMetrics.recordRequest(duration, success);
    
    // Log performance details
    performanceLogger.info('Request completed', {
      method: req.method,
      url: req.originalUrl,
      duration,
      statusCode: res.statusCode,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      dbQueries: req.performance.dbQueries,
      cacheOperations: req.performance.cacheOperations,
    });
    
    // Call original end
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * GraphQL middleware for operation performance monitoring
 */
export const graphqlPerformanceMiddleware = {
  requestDidStart() {
    return {
      didResolveOperation(requestContext) {
        const { request, document } = requestContext;
        
        if (request.operationName || document) {
          requestContext.operationStartTime = Date.now();
          requestContext.operationName = request.operationName || 'anonymous';
        }
      },
      
      willSendResponse(requestContext) {
        if (requestContext.operationStartTime) {
          const duration = Date.now() - requestContext.operationStartTime;
          const success = !requestContext.errors || requestContext.errors.length === 0;
          
          // Calculate query complexity (simplified)
          const complexity = requestContext.document 
            ? this.calculateQueryComplexity(requestContext.document) 
            : 0;
          
          performanceMetrics.recordGraphQLOperation(
            requestContext.operationName,
            duration,
            complexity,
            success
          );
          
          performanceLogger.info('GraphQL operation completed', {
            operationName: requestContext.operationName,
            duration,
            complexity,
            success,
            errors: requestContext.errors?.length || 0,
          });
        }
      },
    };
  },
  
  calculateQueryComplexity(document) {
    // Simplified complexity calculation based on depth
    let maxDepth = 0;
    
    const visit = (node, depth = 0) => {
      maxDepth = Math.max(maxDepth, depth);
      
      if (node.selectionSet) {
        node.selectionSet.selections.forEach(selection => {
          if (selection.selectionSet) {
            visit(selection, depth + 1);
          }
        });
      }
    };
    
    document.definitions.forEach(definition => {
      if (definition.selectionSet) {
        visit(definition, 1);
      }
    });
    
    return maxDepth;
  },
};

/**
 * Database query monitoring wrapper
 */
export const monitorDatabaseQuery = async (queryName, queryFunction) => {
  const startTime = Date.now();
  
  try {
    const result = await queryFunction();
    const duration = Date.now() - startTime;
    
    performanceMetrics.recordDatabaseQuery(duration);
    
    if (duration > performanceMetrics.thresholds.slowQuery) {
      performanceLogger.warn('Slow database query detected', {
        queryName,
        duration,
        threshold: performanceMetrics.thresholds.slowQuery,
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    performanceMetrics.recordDatabaseQuery(duration);
    
    performanceLogger.error('Database query error', {
      queryName,
      duration,
      error: error.message,
    });
    
    throw error;
  }
};

/**
 * Cache operation monitoring wrapper
 */
export const monitorCacheOperation = async (operation, cacheFunction) => {
  const startTime = Date.now();
  
  try {
    const result = await cacheFunction();
    const duration = Date.now() - startTime;
    const hit = result !== null && result !== undefined;
    
    performanceMetrics.recordCacheOperation(operation, hit);
    
    performanceLogger.debug('Cache operation completed', {
      operation,
      hit,
      duration,
    });
    
    return result;
  } catch (error) {
    performanceMetrics.recordCacheOperation(operation, false);
    
    performanceLogger.error('Cache operation error', {
      operation,
      error: error.message,
    });
    
    return null;
  }
};

/**
 * Performance metrics API endpoint
 */
export const getPerformanceMetrics = async (req, res) => {
  try {
    const stats = performanceMetrics.getStats();
    
    // Add Redis info if available
    if (cache.isConnected()) {
      const redisInfo = await cache.getInfo();
      stats.redis = {
        connected: true,
        memory: redisInfo?.used_memory_human || 'unknown',
        connections: redisInfo?.connected_clients || 'unknown',
      };
    } else {
      stats.redis = { connected: false };
    }
    
    res.json({
      success: true,
      data: stats,
      timestamp: Date.now(),
    });
  } catch (error) {
    performanceLogger.error('Error getting performance metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance metrics',
    });
  }
};

/**
 * Health check endpoint with performance context
 */
export const healthCheck = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    };
    
    // Check Redis connection
    if (cache.isConnected()) {
      await cache.get('health:check');
      health.redis = 'connected';
    } else {
      health.redis = 'disconnected';
      health.status = 'degraded';
    }
    
    const duration = Date.now() - startTime;
    health.responseTime = duration;
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: Date.now(),
    });
  }
}; 