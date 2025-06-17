import {
  generalLimiter,
  authLimiter,
  loginFailureLimiter,
  createGraphQLRateLimiter,
  withRateLimit
} from '../../src/middleware/rateLimiting.js';

// Mock express-rate-limit
jest.mock('express-rate-limit', () => {
  return jest.fn(() => {
    const mockMiddleware = jest.fn((req, res, next) => next());
    mockMiddleware.resetTime = Date.now() + 900000; // 15 minutes
    return mockMiddleware;
  });
});

describe('Rate Limiting Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      body: {},
      rateLimit: { resetTime: Date.now() + 900000 }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('generalLimiter', () => {
    it('should be defined and callable', () => {
      expect(generalLimiter).toBeDefined();
      expect(typeof generalLimiter).toBe('function');
    });

    it('should process requests', () => {
      generalLimiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('authLimiter', () => {
    it('should be defined and callable', () => {
      expect(authLimiter).toBeDefined();
      expect(typeof authLimiter).toBe('function');
    });

    it('should process requests', () => {
      authLimiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('loginFailureLimiter', () => {
    it('should be defined and callable', () => {
      expect(loginFailureLimiter).toBeDefined();
      expect(typeof loginFailureLimiter).toBe('function');
    });

    it('should process requests', () => {
      loginFailureLimiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('createGraphQLRateLimiter', () => {
    it('should create a middleware function with default options', () => {
      const limiter = createGraphQLRateLimiter();
      expect(typeof limiter).toBe('function');
    });

    it('should create a middleware function with custom options', () => {
      const limiter = createGraphQLRateLimiter({
        windowMs: 300000,
        max: 50,
        message: 'Custom rate limit message',
        authOperations: ['signup', 'login', 'resetPassword'],
        authMax: 3
      });
      expect(typeof limiter).toBe('function');
    });

    it('should handle requests without GraphQL query', () => {
      const limiter = createGraphQLRateLimiter();
      limiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle requests with GraphQL query', () => {
      const limiter = createGraphQLRateLimiter();
      mockReq.body.query = 'query getProducts { products { id name } }';
      limiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should detect auth operations', () => {
      const limiter = createGraphQLRateLimiter();
      mockReq.body.query = 'mutation login($email: String!, $password: String!) { login(email: $email, password: $password) { token } }';
      limiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle malformed GraphQL queries gracefully', () => {
      const limiter = createGraphQLRateLimiter();
      mockReq.body.query = 'invalid query syntax';
      limiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle requests without IP', () => {
      const limiter = createGraphQLRateLimiter();
      delete mockReq.ip;
      delete mockReq.connection;
      limiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should perform periodic cleanup', () => {
      const limiter = createGraphQLRateLimiter();
      // Mock Math.random to trigger cleanup
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.005); // Less than 0.01 to trigger cleanup
      
      limiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      
      Math.random = originalRandom;
    });
  });

  describe('withRateLimit', () => {
    it('should create a resolver wrapper with default options', () => {
      const mockResolver = jest.fn().mockResolvedValue('result');
      const wrappedResolver = withRateLimit()(mockResolver);
      expect(typeof wrappedResolver).toBe('function');
    });

    it('should create a resolver wrapper with custom options', () => {
      const mockResolver = jest.fn().mockResolvedValue('result');
      const wrappedResolver = withRateLimit({
        windowMs: 300000,
        maxAttempts: 5,
        errorMessage: 'Custom error message'
      })(mockResolver);
      expect(typeof wrappedResolver).toBe('function');
    });

    it('should execute resolver when under rate limit', async () => {
      const mockResolver = jest.fn().mockResolvedValue('result');
      const wrappedResolver = withRateLimit()(mockResolver);
      
      const mockContext = { req: mockReq };
      const mockInfo = { fieldName: 'testField' };
      
      const result = await wrappedResolver({}, {}, mockContext, mockInfo);
      expect(result).toBe('result');
      expect(mockResolver).toHaveBeenCalled();
    });

    it('should handle resolver execution', async () => {
      const mockResolver = jest.fn().mockResolvedValue('test result');
      const wrappedResolver = withRateLimit()(mockResolver);
      
      const mockContext = { req: mockReq };
      const mockInfo = { fieldName: 'getProducts' };
      
      const result = await wrappedResolver({}, {}, mockContext, mockInfo);
      expect(result).toBe('test result');
    });

    it('should handle missing context gracefully', async () => {
      const mockResolver = jest.fn().mockResolvedValue('result');
      const wrappedResolver = withRateLimit()(mockResolver);
      
      const mockContext = {};
      const mockInfo = { fieldName: 'testField' };
      
      const result = await wrappedResolver({}, {}, mockContext, mockInfo);
      expect(result).toBe('result');
    });
  });
}); 