import { requireAuth, requireAdmin } from '../../src/middleware/auth.js';
import { GraphQLError } from 'graphql';

// Mock the logger
jest.mock('../../src/utils/logging.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Authentication Middleware', () => {
  describe('requireAuth', () => {
    it('should return resolver result when authenticated', () => {
      const mockContext = {
        user: { _id: '123', email: 'test@example.com', role: 'customer' },
        isAuthenticated: true,
      };
      const mockResolver = jest.fn().mockReturnValue('resolver result');
      
      const wrappedResolver = requireAuth(mockResolver);
      const result = wrappedResolver(null, {}, mockContext, {});
      
      expect(result).toBe('resolver result');
      expect(mockResolver).toHaveBeenCalledWith(null, {}, mockContext, {});
    });

    it('should throw GraphQLError when not authenticated', () => {
      const mockContext = {
        user: null,
        isAuthenticated: false,
      };
      const mockResolver = jest.fn();
      
      const wrappedResolver = requireAuth(mockResolver);
      
      expect(() => wrappedResolver(null, {}, mockContext, {})).toThrow(GraphQLError);
      expect(() => wrappedResolver(null, {}, mockContext, {})).toThrow('Authentication required');
      expect(mockResolver).not.toHaveBeenCalled();
    });

    it('should call resolver when user is null but authenticated', () => {
      const mockContext = {
        user: null,
        isAuthenticated: true, // Edge case - can happen in some auth systems
      };
      const mockResolver = jest.fn().mockReturnValue('resolver result');
      
      const wrappedResolver = requireAuth(mockResolver);
      const result = wrappedResolver(null, {}, mockContext, {});
      
      expect(result).toBe('resolver result');
      expect(mockResolver).toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should return resolver result when authenticated as admin', () => {
      const mockContext = {
        user: { _id: '123', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
        isAdmin: true,
      };
      const mockResolver = jest.fn().mockReturnValue('admin result');

      const wrappedResolver = requireAdmin(mockResolver);
      const result = wrappedResolver(null, {}, mockContext, {});
      
      expect(result).toBe('admin result');
      expect(mockResolver).toHaveBeenCalledWith(null, {}, mockContext, {});
    });

    it('should throw GraphQLError when not authenticated', () => {
      const mockContext = {
        user: null,
        isAuthenticated: false,
        isAdmin: false,
      };
      const mockResolver = jest.fn();

      const wrappedResolver = requireAdmin(mockResolver);
      
      expect(() => wrappedResolver(null, {}, mockContext, {})).toThrow(GraphQLError);
      expect(() => wrappedResolver(null, {}, mockContext, {})).toThrow('Authentication required');
      expect(mockResolver).not.toHaveBeenCalled();
    });

    it('should throw GraphQLError when authenticated but not admin', () => {
      const mockContext = {
        user: { _id: '123', email: 'customer@example.com', role: 'customer' },
        isAuthenticated: true,
        isAdmin: false,
      };
      const mockResolver = jest.fn();

      const wrappedResolver = requireAdmin(mockResolver);
      
      expect(() => wrappedResolver(null, {}, mockContext, {})).toThrow(GraphQLError);
      expect(() => wrappedResolver(null, {}, mockContext, {})).toThrow('Admin access required');
      expect(mockResolver).not.toHaveBeenCalled();
    });

    it('should call resolver when user is null but isAdmin is true', () => {
      const mockContext = {
        user: null,
        isAuthenticated: true,
        isAdmin: true, // Edge case - can happen in some auth systems
      };
      const mockResolver = jest.fn().mockReturnValue('admin result');

      const wrappedResolver = requireAdmin(mockResolver);
      const result = wrappedResolver(null, {}, mockContext, {});
      
      expect(result).toBe('admin result');
      expect(mockResolver).toHaveBeenCalled();
    });
  });
}); 