import { createLogger, format, transports } from 'winston';

// Create logger instance
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'graph-market' },
  transports: [
    // Write all logs to console in development
    new transports.Console({
      format: process.env.NODE_ENV === 'development' 
        ? format.combine(
            format.colorize(),
            format.simple(),
            format.printf(({ timestamp, level, message, ...meta }) => {
              return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
            })
          )
        : format.json()
    })
  ]
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new transports.File({ 
    filename: 'logs/error.log', 
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new transports.File({ 
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

// HTTP request logging middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  // Extract GraphQL operation info if available
  let operationInfo = {};
  if (req.body && req.body.query) {
    try {
      const operationMatch = req.body.query.match(/(?:mutation|query)\s+(\w+)/);
      const operationType = req.body.query.trim().startsWith('mutation') ? 'mutation' : 'query';
      
      operationInfo = {
        operationType,
        operationName: operationMatch ? operationMatch[1] : 'anonymous',
        variables: req.body.variables ? Object.keys(req.body.variables) : []
      };
    } catch (error) {
      operationInfo = { parseError: true };
    }
  }

  // Log request start
  logger.info('HTTP Request Started', {
    method: req.method,
    url: req.url,
    clientIP,
    userAgent,
    ...operationInfo,
    requestId: req.id || generateRequestId()
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    logger.info('HTTP Request Completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      clientIP,
      ...operationInfo,
      requestId: req.id || 'unknown'
    });

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow Request Detected', {
        method: req.method,
        url: req.url,
        duration,
        clientIP,
        ...operationInfo
      });
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Security event logger
export const securityLogger = {
  authenticationAttempt: (email, success, clientIP, reason = null) => {
    logger.info('Authentication Attempt', {
      email: email ? email.substring(0, 3) + '***' : 'unknown', // Partial email for privacy
      success,
      clientIP,
      reason,
      timestamp: new Date().toISOString(),
      type: 'authentication'
    });
  },

  authenticationFailure: (email, clientIP, reason) => {
    logger.warn('Authentication Failure', {
      email: email ? email.substring(0, 3) + '***' : 'unknown',
      clientIP,
      reason,
      timestamp: new Date().toISOString(),
      type: 'security'
    });
  },

  rateLimitExceeded: (clientIP, operation, limit) => {
    logger.warn('Rate Limit Exceeded', {
      clientIP,
      operation,
      limit,
      timestamp: new Date().toISOString(),
      type: 'security'
    });
  },

  suspiciousActivity: (clientIP, activity, details = {}) => {
    logger.error('Suspicious Activity Detected', {
      clientIP,
      activity,
      details,
      timestamp: new Date().toISOString(),
      type: 'security'
    });
  },

  unauthorizedAccess: (clientIP, resource, userInfo = null) => {
    logger.warn('Unauthorized Access Attempt', {
      clientIP,
      resource,
      userInfo: userInfo ? { id: userInfo.id, role: userInfo.role } : null,
      timestamp: new Date().toISOString(),
      type: 'security'
    });
  }
};

// GraphQL operation logger
export const graphqlLogger = {
  operationStart: (operationName, variables, context) => {
    logger.debug('GraphQL Operation Started', {
      operationName,
      variableKeys: variables ? Object.keys(variables) : [],
      userId: context.user?.id,
      userRole: context.user?.role,
      clientIP: context.req?.ip,
      type: 'graphql'
    });
  },

  operationComplete: (operationName, duration, success, errorMessage = null) => {
    const logLevel = success ? 'debug' : 'error';
    
    logger.log(logLevel, 'GraphQL Operation Completed', {
      operationName,
      duration,
      success,
      errorMessage,
      type: 'graphql'
    });
  },

  validationError: (operationName, field, value, error) => {
    logger.warn('GraphQL Validation Error', {
      operationName,
      field,
      value: typeof value === 'string' ? value.substring(0, 50) + '...' : value,
      error: error.message,
      type: 'validation'
    });
  }
};

// Performance monitoring
export const performanceLogger = {
  slowQuery: (operation, duration, details = {}) => {
    logger.warn('Slow Operation Detected', {
      operation,
      duration,
      details,
      type: 'performance'
    });
  },

  databaseQuery: (collection, operation, duration) => {
    if (duration > 100) { // Log slow database queries
      logger.warn('Slow Database Query', {
        collection,
        operation,
        duration,
        type: 'database'
      });
    }
  },

  cacheHit: (key, operation) => {
    logger.debug('Cache Hit', {
      key: key.substring(0, 50),
      operation,
      type: 'cache'
    });
  },

  cacheMiss: (key, operation) => {
    logger.debug('Cache Miss', {
      key: key.substring(0, 50),
      operation,
      type: 'cache'
    });
  },
  
  cacheSet: (key, operation) => {
    logger.debug('Cache Set', { 
      key: key.substring(0, 50), 
      operation, 
      type: 'cache' 
    });
  },
  
  info: (message, meta = {}) => {
    logger.info(message, { ...meta, type: 'performance' });
  },
  
  warn: (message, meta = {}) => {
    logger.warn(message, { ...meta, type: 'performance' });
  },
  
  error: (message, meta = {}) => {
    logger.error(message, { ...meta, type: 'performance' });
  },
  
  debug: (message, meta = {}) => {
    logger.debug(message, { ...meta, type: 'performance' });
  },
  
  // Specific performance metrics
  queryPerformance: (operation, duration, complexity = 0) => {
    logger.info('Query performance', {
      operation,
      duration,
      complexity,
      type: 'query_performance',
    });
  },
  
  dbQueryPerformance: (queryName, duration, success = true) => {
    logger.info('Database query performance', {
      queryName,
      duration,
      success,
      type: 'db_performance',
    });
  },
  
  apiResponse: (req, res, duration) => {
    logger.info('API response', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      type: 'api_response',
    });
  },
};

// Error logger with context
export const errorLogger = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...context,
    type: 'error'
  });
};

// Utility function to generate request IDs
const generateRequestId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Request ID middleware
export const requestIdMiddleware = (req, res, next) => {
  req.id = generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Export the main logger for custom logging
export { logger };

export default logger; 