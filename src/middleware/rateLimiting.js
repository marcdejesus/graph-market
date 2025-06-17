import rateLimit from 'express-rate-limit';
import { GraphQLError } from 'graphql';

// General API rate limiting
export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Strict rate limiting for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again later.',
    retryAfter: 900 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many authentication attempts from this IP, please try again later.',
      retryAfter: 900
    });
  }
});

// Very strict rate limiting for failed login attempts
export const loginFailureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 failed login attempts per hour
  message: {
    error: 'Too many failed login attempts from this IP, account temporarily locked.',
    retryAfter: 3600 // 1 hour in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Only apply this limiter to failed requests
    return false;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many failed login attempts from this IP, account temporarily locked.',
      retryAfter: 3600
    });
  }
});

// GraphQL-specific rate limiting middleware
export const createGraphQLRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many GraphQL requests',
    authOperations = ['signup', 'login'],
    authMax = 5
  } = options;

  // Store for tracking operations
  const operationCounts = new Map();

  return (req, res, next) => {
    const clientIP = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
    const now = Date.now();
    
    // Parse GraphQL operation
    let operationName = null;
    let isAuthOperation = false;

    try {
      if (req.body && req.body.query) {
        // Extract operation name from GraphQL query
        const queryMatch = req.body.query.match(/(?:mutation|query)\s+(\w+)/);
        if (queryMatch) {
          operationName = queryMatch[1].toLowerCase();
          isAuthOperation = authOperations.includes(operationName);
        }
      }
    } catch (error) {
      // If we can't parse the operation, continue with general limiting
    }

    // Get or create client record
    if (!operationCounts.has(clientIP)) {
      operationCounts.set(clientIP, {
        general: { count: 0, resetTime: now + windowMs },
        auth: { count: 0, resetTime: now + windowMs }
      });
    }

    const clientRecord = operationCounts.get(clientIP);

    // Reset counters if window has expired
    if (now > clientRecord.general.resetTime) {
      clientRecord.general = { count: 0, resetTime: now + windowMs };
    }
    if (now > clientRecord.auth.resetTime) {
      clientRecord.auth = { count: 0, resetTime: now + windowMs };
    }

    // Check limits
    const generalLimit = max;
    const authLimit = authMax;

    if (clientRecord.general.count >= generalLimit) {
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil((clientRecord.general.resetTime - now) / 1000)
      });
    }

    if (isAuthOperation && clientRecord.auth.count >= authLimit) {
      return res.status(429).json({
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: Math.ceil((clientRecord.auth.resetTime - now) / 1000)
      });
    }

    // Increment counters
    clientRecord.general.count++;
    if (isAuthOperation) {
      clientRecord.auth.count++;
    }

    // Clean up old records periodically (simple cleanup)
    if (Math.random() < 0.01) { // 1% chance to cleanup
      for (const [ip, record] of operationCounts.entries()) {
        if (now > record.general.resetTime && now > record.auth.resetTime) {
          operationCounts.delete(ip);
        }
      }
    }

    next();
  };
};

// Rate limiting resolver wrapper for GraphQL resolvers
export const withRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    maxAttempts = 10,
    errorMessage = 'Rate limit exceeded for this operation'
  } = options;

  // In-memory store for tracking (in production, use Redis)
  const attempts = new Map();

  return (resolver) => {
    return async (parent, args, context, info) => {
      const clientIP = context.req?.ip || context.req?.connection?.remoteAddress || 'unknown';
      const operationName = info.fieldName;
      const key = `${clientIP}:${operationName}`;
      const now = Date.now();

      // Get or create attempt record
      if (!attempts.has(key)) {
        attempts.set(key, { count: 0, resetTime: now + windowMs });
      }

      const attemptRecord = attempts.get(key);

      // Reset if window expired
      if (now > attemptRecord.resetTime) {
        attemptRecord.count = 0;
        attemptRecord.resetTime = now + windowMs;
      }

      // Check limit
      if (attemptRecord.count >= maxAttempts) {
        throw new GraphQLError(errorMessage, {
          extensions: {
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil((attemptRecord.resetTime - now) / 1000)
          }
        });
      }

      // Increment counter
      attemptRecord.count++;

      // Execute resolver
      return resolver(parent, args, context, info);
    };
  };
}; 