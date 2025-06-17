import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { GraphQLError } from 'graphql';
import jwt from 'jsonwebtoken';
import { User } from '../../src/models/User.js';
import { userResolvers } from '../../src/resolvers/userResolvers.js';
import { setupTestDatabase, teardownTestDatabase, clearDatabase } from '../setup.js';

describe('User Resolvers', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
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

        const result = await userResolvers.Mutation.signup(null, userData);

        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
        expect(result.user.email).toBe(userData.email);
        expect(result.user.firstName).toBe(userData.firstName);
        expect(result.user.lastName).toBe(userData.lastName);
                 expect(result.user.role).toBe('customer');
        expect(result.user.isActive).toBe(true);

        // Verify JWT token
        const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
        expect(decoded.userId).toBe(result.user.id);
      });

      test('should create user without optional fields', async () => {
        const userData = {
          email: 'minimal@example.com',
          password: 'password123'
        };

        const result = await userResolvers.Mutation.signup(null, userData);

        expect(result.user.email).toBe(userData.email);
                 expect(result.user.firstName).toBeUndefined();
         expect(result.user.lastName).toBeUndefined();
      });

      test('should reject invalid email format', async () => {
        const userData = {
          email: 'invalid-email',
          password: 'password123'
        };

        await expect(userResolvers.Mutation.signup(null, userData))
          .rejects.toThrow(GraphQLError);
      });

      test('should reject short password', async () => {
        const userData = {
          email: 'test@example.com',
          password: '123'
        };

        await expect(userResolvers.Mutation.signup(null, userData))
          .rejects.toThrow(GraphQLError);
      });

      test('should reject duplicate email', async () => {
        const userData = {
          email: 'duplicate@example.com',
          password: 'password123'
        };

        // Create first user
        await userResolvers.Mutation.signup(null, userData);

        // Try to create duplicate
        await expect(userResolvers.Mutation.signup(null, userData))
          .rejects.toThrow('User with this email already exists');
      });

      test('should handle case-insensitive email', async () => {
        const userData1 = {
          email: 'Test@Example.com',
          password: 'password123'
        };

        const userData2 = {
          email: 'test@example.com',
          password: 'password123'
        };

        await userResolvers.Mutation.signup(null, userData1);

        await expect(userResolvers.Mutation.signup(null, userData2))
          .rejects.toThrow('User with this email already exists');
      });
    });

    describe('login', () => {
      let testUser;

      beforeEach(async () => {
        // Create a test user for login tests
        const userData = {
          email: 'login@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        };
        
        const signupResult = await userResolvers.Mutation.signup(null, userData);
        testUser = signupResult.user;
      });

      test('should login with valid credentials', async () => {
        const loginData = {
          email: 'login@example.com',
          password: 'password123'
        };

        const result = await userResolvers.Mutation.login(null, loginData);

        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
        expect(result.user.email).toBe(testUser.email);
        expect(result.user.id).toBe(testUser.id);

        // Verify JWT token
        const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
        expect(decoded.userId).toBe(testUser.id);
      });

      test('should handle case-insensitive email login', async () => {
        const loginData = {
          email: 'LOGIN@EXAMPLE.COM',
          password: 'password123'
        };

        const result = await userResolvers.Mutation.login(null, loginData);
        expect(result.user.email).toBe(testUser.email);
      });

      test('should reject invalid email', async () => {
        const loginData = {
          email: 'nonexistent@example.com',
          password: 'password123'
        };

        await expect(userResolvers.Mutation.login(null, loginData))
          .rejects.toThrow('Invalid email or password');
      });

      test('should reject invalid password', async () => {
        const loginData = {
          email: 'login@example.com',
          password: 'wrongpassword'
        };

        await expect(userResolvers.Mutation.login(null, loginData))
          .rejects.toThrow('Invalid email or password');
      });

      test('should reject login for inactive user', async () => {
        // Deactivate the user
        await User.findByIdAndUpdate(testUser.id, { isActive: false });

        const loginData = {
          email: 'login@example.com',
          password: 'password123'
        };

        await expect(userResolvers.Mutation.login(null, loginData))
          .rejects.toThrow('Invalid email or password');
      });

      test('should reject missing password', async () => {
        const loginData = {
          email: 'login@example.com'
        };

        await expect(userResolvers.Mutation.login(null, loginData))
          .rejects.toThrow('Password is required');
      });
    });

    describe('updateUserRole', () => {
      let adminUser, customerUser, adminContext;

      beforeEach(async () => {
        // Create admin user
        const adminData = await userResolvers.Mutation.signup(null, {
          email: 'admin@example.com',
          password: 'password123'
        });
        adminUser = adminData.user;
        
        // Update to admin role directly in database
        await User.findByIdAndUpdate(adminUser.id, { role: 'admin' });
        
        // Create customer user
        const customerData = await userResolvers.Mutation.signup(null, {
          email: 'customer@example.com',
          password: 'password123'
        });
        customerUser = customerData.user;

        // Create admin context
        adminContext = {
          user: { ...adminUser, role: 'admin' },
          isAuthenticated: true,
          isAdmin: true,
          isCustomer: false
        };
      });

      test('should update user role as admin', async () => {
        const result = await userResolvers.Mutation.updateUserRole(
          null,
          { userId: customerUser.id, role: 'ADMIN' },
          adminContext
        );

                 expect(result.role).toBe('admin');
        expect(result.id).toBe(customerUser.id);

        // Verify in database
        const updatedUser = await User.findById(customerUser.id);
        expect(updatedUser.role).toBe('admin');
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
      const userData = await userResolvers.Mutation.signup(null, {
        email: 'query@example.com',
        password: 'password123',
        firstName: 'Query',
        lastName: 'User'
      });
      testUser = userData.user;

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