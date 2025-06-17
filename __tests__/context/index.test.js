import { createContext } from '../../src/context/index.js';
import { User } from '../../src/models/User.js';
import jwt from 'jsonwebtoken';
import { ensureTestDBConnection, clearTestCollections, closeTestDBConnection } from '../utils/testDB.js';

// Mock the logger to avoid console output during tests
jest.mock('../../src/utils/logging.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('GraphQL Context', () => {
  let mockUser;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
    await ensureTestDBConnection();
  });

  afterAll(async () => {
    await closeTestDBConnection();
  });

  beforeEach(async () => {
    await clearTestCollections();
    
    // Create a test user
    mockUser = await User.create({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      role: 'customer',
    });
  });

  describe('createContext', () => {
    it('should return unauthenticated context when no authorization header', async () => {
      const req = { headers: {} };
      const context = await createContext({ req });

      expect(context.user).toBeNull();
      expect(context.isAuthenticated).toBe(false);
      expect(context.isAdmin).toBe(false);
      expect(context.isCustomer).toBe(false);
    });

    it('should return unauthenticated context when authorization header is malformed', async () => {
      const req = { 
        headers: { 
          authorization: 'InvalidFormat token123' 
        } 
      };
      const context = await createContext({ req });

      expect(context.user).toBeNull();
      expect(context.isAuthenticated).toBe(false);
      expect(context.isAdmin).toBe(false);
      expect(context.isCustomer).toBe(false);
    });

    it('should return authenticated context for valid customer token', async () => {
      const token = jwt.sign({ userId: mockUser._id }, process.env.JWT_SECRET);
      const req = { 
        headers: { 
          authorization: `Bearer ${token}` 
        } 
      };
      const context = await createContext({ req });

      expect(context.user).toBeTruthy();
      expect(context.user._id.toString()).toBe(mockUser._id.toString());
      expect(context.user.email).toBe('test@example.com');
      expect(context.user.password).toBeUndefined(); // Should be excluded
      expect(context.isAuthenticated).toBe(true);
      expect(context.isAdmin).toBe(false);
      expect(context.isCustomer).toBe(true);
    });

    it('should return authenticated context for valid admin token', async () => {
      // Create admin user
      const adminUser = await User.create({
        email: 'admin@example.com',
        password: 'password123',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      });

      const token = jwt.sign({ userId: adminUser._id }, process.env.JWT_SECRET);
      const req = { 
        headers: { 
          authorization: `Bearer ${token}` 
        } 
      };
      const context = await createContext({ req });

      expect(context.user).toBeTruthy();
      expect(context.user._id.toString()).toBe(adminUser._id.toString());
      expect(context.user.email).toBe('admin@example.com');
      expect(context.isAuthenticated).toBe(true);
      expect(context.isAdmin).toBe(true);
      expect(context.isCustomer).toBe(false);
    });

    it('should return unauthenticated context for invalid token', async () => {
      const req = { 
        headers: { 
          authorization: 'Bearer invalid-token' 
        } 
      };
      const context = await createContext({ req });

      expect(context.user).toBeNull();
      expect(context.isAuthenticated).toBe(false);
      expect(context.isAdmin).toBe(false);
      expect(context.isCustomer).toBe(false);
    });

    it('should return unauthenticated context for expired token', async () => {
      // Create expired token (expired 1 hour ago)
      const expiredToken = jwt.sign(
        { userId: mockUser._id, exp: Math.floor(Date.now() / 1000) - 3600 },
        process.env.JWT_SECRET
      );
      const req = { 
        headers: { 
          authorization: `Bearer ${expiredToken}` 
        } 
      };
      const context = await createContext({ req });

      expect(context.user).toBeNull();
      expect(context.isAuthenticated).toBe(false);
      expect(context.isAdmin).toBe(false);
      expect(context.isCustomer).toBe(false);
    });

    it('should return unauthenticated context when user not found in database', async () => {
      // Create token with non-existent user ID
      const nonExistentId = '507f1f77bcf86cd799439011';
      const token = jwt.sign({ userId: nonExistentId }, process.env.JWT_SECRET);
      const req = { 
        headers: { 
          authorization: `Bearer ${token}` 
        } 
      };
      const context = await createContext({ req });

      expect(context.user).toBeNull();
      expect(context.isAuthenticated).toBe(false);
      expect(context.isAdmin).toBe(false);
      expect(context.isCustomer).toBe(false);
    });

    it('should handle missing JWT_SECRET gracefully', async () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const token = 'some-token';
      const req = { 
        headers: { 
          authorization: `Bearer ${token}` 
        } 
      };
      const context = await createContext({ req });

      expect(context.user).toBeNull();
      expect(context.isAuthenticated).toBe(false);
      expect(context.isAdmin).toBe(false);
      expect(context.isCustomer).toBe(false);

      // Restore JWT_SECRET
      process.env.JWT_SECRET = originalSecret;
    });
  });
}); 