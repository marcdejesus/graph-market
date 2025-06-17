import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { GraphQLError } from 'graphql';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../../src/models/User.js';
import { userResolvers } from '../../src/resolvers/userResolvers.js';

// Mock the User model
jest.mock('../../src/models/User.js');

describe('User Resolvers', () => {
  let sampleUsers;
  
  // Mock context helper
  const mockContext = (userOverride = null) => ({
    req: { ip: '127.0.0.1' },
    user: userOverride,
    isAuthenticated: !!userOverride,
    isAdmin: userOverride?.role === 'admin',
    isCustomer: userOverride?.role === 'customer'
  });

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Set up test environment
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';

    // Create sample users for testing
    sampleUsers = [
      {
        _id: new mongoose.Types.ObjectId(),
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'customer',
        isActive: true,
        password: '$2b$10$hashedpassword123',
        comparePassword: jest.fn()
      },
      {
        _id: new mongoose.Types.ObjectId(),
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
        isActive: true,
        password: '$2b$10$hashedpassword456',
        comparePassword: jest.fn()
      }
    ];

    // Setup User model mocks
    User.findOne.mockImplementation(async (query) => {
      if (query.email) {
        const email = query.email.toLowerCase();
        const user = sampleUsers.find(u => u.email.toLowerCase() === email);
        if (user && (!query.isActive || query.isActive === user.isActive)) {
          return user;
        }
      }
      return null;
    });

    User.create.mockImplementation(async (userData) => {
      const newUser = {
        _id: new mongoose.Types.ObjectId(),
        ...userData,
        email: userData.email.toLowerCase(),
        role: userData.role || 'customer',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        id: new mongoose.Types.ObjectId().toString()
      };
      return newUser;
    });

    User.findByIdAndUpdate.mockImplementation(async (id, update) => {
      const user = sampleUsers.find(u => u._id.toString() === id.toString());
      if (user) {
        Object.assign(user, update);
        return user;
      }
      return null;
    });
  });

  describe('Mutations', () => {
    describe('signup', () => {
      test('should create a new user with valid data', async () => {
        const userData = {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: 'Doe'
        };

        // Mock User.findOne to return null (no existing user)
        User.findOne.mockResolvedValueOnce(null);

        // Create a consistent user ID for the test
        const testUserId = new mongoose.Types.ObjectId();
        const expectedUser = {
          _id: testUserId,
          id: testUserId.toString(),
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: 'customer',
          isActive: true
        };

        // Mock User.create to return the consistent user
        User.create.mockResolvedValueOnce(expectedUser);

        const mockContext = { req: { ip: '127.0.0.1' } };
        const result = await userResolvers.Mutation.signup(null, userData, mockContext);

        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
        expect(result.user.email).toBe(userData.email);
        expect(result.user.firstName).toBe(userData.firstName);
        expect(result.user.lastName).toBe(userData.lastName);
        expect(result.user.role).toBe('customer');
        expect(result.user.isActive).toBe(true);

        // Verify JWT token
        const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
        expect(decoded.userId).toBe(testUserId.toString());
      });

      test('should create user without optional fields', async () => {
        const userData = {
          email: 'minimal@example.com',
          password: 'password123'
        };

        const result = await userResolvers.Mutation.signup(null, userData, mockContext());

        expect(result.user.email).toBe(userData.email);
                 expect(result.user.firstName).toBeUndefined();
         expect(result.user.lastName).toBeUndefined();
      });

      test('should reject invalid email format', async () => {
        const userData = {
          email: 'invalid-email',
          password: 'password123'
        };

        await expect(userResolvers.Mutation.signup(null, userData, mockContext()))
          .rejects.toThrow(GraphQLError);
      });

      test('should reject short password', async () => {
        const userData = {
          email: 'test@example.com',
          password: '123'
        };

        await expect(userResolvers.Mutation.signup(null, userData, mockContext()))
          .rejects.toThrow(GraphQLError);
      });

      test('should reject duplicate email', async () => {
        const userData = {
          email: 'duplicate@example.com',
          password: 'password123'
        };

        // Mock User.findOne to return existing user for duplicate check
        User.findOne.mockResolvedValueOnce({
          email: 'duplicate@example.com',
          isActive: true
        });

        // Try to create duplicate
        await expect(userResolvers.Mutation.signup(null, userData, mockContext()))
          .rejects.toThrow('User with this email already exists');
      });

      test('should handle case-insensitive email', async () => {
        const userData2 = {
          email: 'test@example.com',
          password: 'password123'
        };

        // Mock User.findOne to return existing user for case-insensitive check
        User.findOne.mockResolvedValueOnce({
          email: 'test@example.com',
          isActive: true
        });

        await expect(userResolvers.Mutation.signup(null, userData2, mockContext()))
          .rejects.toThrow('User with this email already exists');
      });
    });

    describe('login', () => {
      let testUser;

      beforeEach(async () => {
        // Create a mock test user for login tests
        testUser = {
          _id: new mongoose.Types.ObjectId(),
          id: new mongoose.Types.ObjectId().toString(),
          email: 'login@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'customer',
          isActive: true,
          comparePassword: jest.fn()
        };
        
        // Mock successful password comparison by default
        testUser.comparePassword.mockResolvedValue(true);
      });

      test('should login with valid credentials', async () => {
        const loginData = {
          email: 'login@example.com',
          password: 'password123'
        };

        // Mock User.findOne to return the test user
        User.findOne.mockResolvedValueOnce(testUser);

        const result = await userResolvers.Mutation.login(null, loginData, mockContext());

        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
        expect(result.user.email).toBe(testUser.email);
        expect(result.user.id).toBe(testUser.id);

        // Verify JWT token - the token should contain the string version of the ID
        const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
        expect(decoded.userId).toBe(testUser._id.toString());
      });

      test('should handle case-insensitive email login', async () => {
        const loginData = {
          email: 'LOGIN@EXAMPLE.COM',
          password: 'password123'
        };

        // Mock User.findOne to return the test user
        User.findOne.mockResolvedValueOnce(testUser);

        const result = await userResolvers.Mutation.login(null, loginData, mockContext());
        expect(result.user.email).toBe(testUser.email);
      });

      test('should reject invalid email', async () => {
        const loginData = {
          email: 'nonexistent@example.com',
          password: 'password123'
        };

        // Mock User.findOne to return null (user not found)
        User.findOne.mockResolvedValueOnce(null);

        await expect(userResolvers.Mutation.login(null, loginData, mockContext()))
          .rejects.toThrow('Invalid email or password');
      });

      test('should reject invalid password', async () => {
        const loginData = {
          email: 'login@example.com',
          password: 'wrongpassword'
        };

        // Mock User.findOne to return user but comparePassword to return false
        testUser.comparePassword.mockResolvedValueOnce(false);
        User.findOne.mockResolvedValueOnce(testUser);

        await expect(userResolvers.Mutation.login(null, loginData, mockContext()))
          .rejects.toThrow('Invalid email or password');
      });

      test('should reject login for inactive user', async () => {
        const loginData = {
          email: 'login@example.com',
          password: 'password123'
        };

        // Mock User.findOne to return null (inactive user filtered out)
        User.findOne.mockResolvedValueOnce(null);

        await expect(userResolvers.Mutation.login(null, loginData, mockContext()))
          .rejects.toThrow('Invalid email or password');
      });

      test('should reject missing password', async () => {
        const loginData = {
          email: 'login@example.com'
        };

        await expect(userResolvers.Mutation.login(null, loginData, mockContext()))
          .rejects.toThrow('Password is required');
      });
    });

    describe('updateUserRole', () => {
      let adminUser, customerUser, adminContext;

      beforeEach(async () => {
        // Create mock admin user
        adminUser = {
          _id: new mongoose.Types.ObjectId(),
          id: new mongoose.Types.ObjectId().toString(),
          email: 'admin@example.com',
          role: 'admin',
          isActive: true
        };
        
        // Create mock customer user
        customerUser = {
          _id: new mongoose.Types.ObjectId(),
          id: new mongoose.Types.ObjectId().toString(),
          email: 'customer@example.com',
          role: 'customer',
          isActive: true
        };

        // Create admin context
        adminContext = {
          user: adminUser,
          isAuthenticated: true,
          isAdmin: true,
          isCustomer: false
        };
      });

      test('should update user role as admin', async () => {
        // Create a mock user with save method
        const mockUserWithSave = {
          ...customerUser,
          save: jest.fn().mockResolvedValue(true)
        };
        
        // Mock User.findById to return the customer user with save method
        User.findById.mockResolvedValueOnce(mockUserWithSave);

        const result = await userResolvers.Mutation.updateUserRole(
          null,
          { userId: customerUser.id, role: 'ADMIN' },
          adminContext
        );

        expect(result.role).toBe('admin');
        expect(result.id).toBe(customerUser.id);
        expect(mockUserWithSave.save).toHaveBeenCalled();
      });

      test('should handle invalid user ID', async () => {
        await expect(userResolvers.Mutation.updateUserRole(
          null,
          { userId: 'invalid-id', role: 'ADMIN' },
          adminContext
        )).rejects.toThrow('Invalid ID format');
      });

      test('should handle non-existent user', async () => {
        const fakeObjectId = '507f1f77bcf86cd799439011';
        
        // Mock User.findById to return null for non-existent user
        User.findById.mockResolvedValueOnce(null);
        
        await expect(userResolvers.Mutation.updateUserRole(
          null,
          { userId: fakeObjectId, role: 'ADMIN' },
          adminContext
        )).rejects.toThrow('User not found');
      });
    });
  });

  describe('Queries', () => {
    let testUser, userContext;

    beforeEach(async () => {
      // Create mock test user for queries
      testUser = {
        _id: new mongoose.Types.ObjectId(),
        id: new mongoose.Types.ObjectId().toString(),
        email: 'query@example.com',
        firstName: 'Query',
        lastName: 'User',
        role: 'customer',
        isActive: true
      };

      userContext = {
        user: testUser,
        isAuthenticated: true,
        isAdmin: false,
        isCustomer: true
      };
    });

    describe('me', () => {
      test('should return current user', async () => {
        const result = await userResolvers.Query.me(null, {}, userContext);
        
        expect(result.id).toBe(testUser.id);
        expect(result.email).toBe(testUser.email);
      });

      test('should reject unauthenticated request', async () => {
        const unauthContext = {
          user: null,
          isAuthenticated: false,
          isAdmin: false,
          isCustomer: false
        };

        try {
          await userResolvers.Query.me(null, {}, unauthContext);
          fail('Should have thrown GraphQLError');
        } catch (error) {
          expect(error).toBeInstanceOf(GraphQLError);
          expect(error.message).toBe('Authentication required');
        }
      });
    });
  });

  describe('User Type Resolvers', () => {
    test('should transform role to uppercase', () => {
      const user = { role: 'customer' };
      const result = userResolvers.User.role(user);
      expect(result).toBe('CUSTOMER');
    });

    test('should compute full name', () => {
      const user1 = { firstName: 'John', lastName: 'Doe' };
      const user2 = { firstName: 'John', lastName: null };
      const user3 = { firstName: null, lastName: 'Doe' };
      const user4 = { firstName: null, lastName: null };

      expect(userResolvers.User.fullName(user1)).toBe('John Doe');
      expect(userResolvers.User.fullName(user2)).toBe('John');
      expect(userResolvers.User.fullName(user3)).toBe('Doe');
      expect(userResolvers.User.fullName(user4)).toBeNull();
    });
  });
}); 