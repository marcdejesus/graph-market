import {
  logger,
  performanceLogger,
  securityLogger,
  requestLogger
} from '../../src/utils/logging.js';

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(() => ({})),
    timestamp: jest.fn(() => ({})),
    printf: jest.fn(() => ({})),
    colorize: jest.fn(() => ({})),
    simple: jest.fn(() => ({})),
    errors: jest.fn(() => ({})), // Add missing errors format
    json: jest.fn(() => ({})), // Add missing json format
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

describe('Logging Utils', () => {
  describe('logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have logging methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('performanceLogger', () => {
    it('should be defined', () => {
      expect(performanceLogger).toBeDefined();
    });

    it('should have cacheHit method', () => {
      expect(typeof performanceLogger.cacheHit).toBe('function');
    });

    it('should have cacheMiss method', () => {
      expect(typeof performanceLogger.cacheMiss).toBe('function');
    });
  });

  describe('securityLogger', () => {
    it('should be defined', () => {
      expect(securityLogger).toBeDefined();
    });

    it('should have suspiciousActivity method', () => {
      expect(typeof securityLogger.suspiciousActivity).toBe('function');
    });
  });

  describe('requestLogger', () => {
    it('should be defined and callable', () => {
      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger).toBe('function');
    });

    it('should handle valid request and response', () => {
      const mockReq = {
        method: 'GET',
        url: '/api/test',
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' },
        get: jest.fn((header) => header === 'User-Agent' ? 'test-agent' : null)
      };
      const mockRes = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            setTimeout(callback, 10); // Simulate async finish
          }
        })
      };
      const mockNext = jest.fn();

      requestLogger(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle request without IP', () => {
      const mockReq = {
        method: 'POST',
        url: '/api/test',
        connection: { remoteAddress: '127.0.0.1' },
        headers: {},
        get: jest.fn(() => null)
      };
      const mockRes = {
        statusCode: 404,
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            setTimeout(callback, 10);
          }
        })
      };
      const mockNext = jest.fn();

      requestLogger(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });
}); 