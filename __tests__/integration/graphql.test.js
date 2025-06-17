import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../../src/schema/index.js';
import { resolvers } from '../../src/resolvers/index.js';
import { createContext } from '../../src/context/index.js';

describe.skip('GraphQL API Integration', () => {
  let server;

  beforeAll(async () => {
    // Skip database setup for this test - focus on GraphQL layer
    process.env.SKIP_DB_SETUP = 'true';
    
    // Create Apollo Server for testing
    server = new ApolloServer({
      typeDefs,
      resolvers,
    });
  });

  afterAll(async () => {
    // Clean up
    delete process.env.SKIP_DB_SETUP;
  });

  beforeEach(async () => {
    // Skip database cleanup for this test
  });

  describe('Authentication Workflow', () => {
    test('should complete signup -> login -> me query workflow', async () => {
      // Test Signup
      const signupQuery = `
        mutation Signup($email: String!, $password: String!, $firstName: String, $lastName: String) {
          signup(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {
            token
            user {
              id
              email
              role
              firstName
              lastName
              fullName
              isActive
            }
          }
        }
      `;

      const signupVariables = {
        email: 'integration@test.com',
        password: 'password123',
        firstName: 'Integration',
        lastName: 'Test'
      };

      const signupContext = await createContext({ 
        req: { headers: {} } 
      });

      const signupResult = await server.executeOperation({
        query: signupQuery,
        variables: signupVariables,
      }, { contextValue: signupContext });

      expect(signupResult.body.kind).toBe('single');
      expect(signupResult.body.singleResult.errors).toBeUndefined();
      expect(signupResult.body.singleResult.data.signup).toHaveProperty('token');
      expect(signupResult.body.singleResult.data.signup.user.email).toBe(signupVariables.email);
      expect(signupResult.body.singleResult.data.signup.user.role).toBe('CUSTOMER');

      const token = signupResult.body.singleResult.data.signup.token;

      // Test Login
      const loginQuery = `
        mutation Login($email: String!, $password: String!) {
          login(email: $email, password: $password) {
            token
            user {
              id
              email
              role
            }
          }
        }
      `;

      const loginVariables = {
        email: signupVariables.email,
        password: signupVariables.password
      };

      const loginContext = await createContext({ 
        req: { headers: {} } 
      });

      const loginResult = await server.executeOperation({
        query: loginQuery,
        variables: loginVariables,
      }, { contextValue: loginContext });

      expect(loginResult.body.kind).toBe('single');
      expect(loginResult.body.singleResult.errors).toBeUndefined();
      expect(loginResult.body.singleResult.data.login).toHaveProperty('token');
      expect(loginResult.body.singleResult.data.login.user.email).toBe(signupVariables.email);

      // Test Me Query with Authentication
      const meQuery = `
        query Me {
          me {
            id
            email
            role
            fullName
            isActive
          }
        }
      `;

      const authenticatedContext = await createContext({ 
        req: { 
          headers: { 
            authorization: `Bearer ${token}` 
          } 
        } 
      });

      const meResult = await server.executeOperation({
        query: meQuery,
      }, { contextValue: authenticatedContext });

      expect(meResult.body.kind).toBe('single');
      expect(meResult.body.singleResult.errors).toBeUndefined();
      expect(meResult.body.singleResult.data.me.email).toBe(signupVariables.email);
      expect(meResult.body.singleResult.data.me.role).toBe('CUSTOMER');
      expect(meResult.body.singleResult.data.me.fullName).toBe('Integration Test');
    });

    test('should reject unauthenticated me query', async () => {
      const meQuery = `
        query Me {
          me {
            id
            email
          }
        }
      `;

      const unauthenticatedContext = await createContext({ 
        req: { headers: {} } 
      });

      const result = await server.executeOperation({
        query: meQuery,
      }, { contextValue: unauthenticatedContext });

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].message).toBe('Authentication required');
    });

    test('should reject invalid credentials', async () => {
      // First create a user
      const signupQuery = `
        mutation Signup($email: String!, $password: String!) {
          signup(email: $email, password: $password) {
            user {
              email
            }
          }
        }
      `;

      const signupContext = await createContext({ 
        req: { headers: {} } 
      });

      await server.executeOperation({
        query: signupQuery,
        variables: { email: 'test@example.com', password: 'password123' },
      }, { contextValue: signupContext });

      // Try to login with wrong password
      const loginQuery = `
        mutation Login($email: String!, $password: String!) {
          login(email: $email, password: $password) {
            token
          }
        }
      `;

      const loginContext = await createContext({ 
        req: { headers: {} } 
      });

      const result = await server.executeOperation({
        query: loginQuery,
        variables: { email: 'test@example.com', password: 'wrongpassword' },
      }, { contextValue: loginContext });

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].message).toBe('Invalid email or password');
    });
  });

  describe('Schema Introspection', () => {
    test('should allow introspection queries', async () => {
      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            types {
              name
              kind
            }
          }
        }
      `;

      const context = await createContext({ 
        req: { headers: {} } 
      });

      const result = await server.executeOperation({
        query: introspectionQuery,
      }, { contextValue: context });

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeUndefined();
      expect(result.body.singleResult.data.__schema.types).toBeDefined();
      
      // Check that our custom types are present
      const typeNames = result.body.singleResult.data.__schema.types.map(type => type.name);
      expect(typeNames).toContain('User');
      expect(typeNames).toContain('Product');
      expect(typeNames).toContain('Order');
      expect(typeNames).toContain('AuthPayload');
    });
  });

  describe('Input Validation', () => {
    test('should validate email format', async () => {
      const signupQuery = `
        mutation Signup($email: String!, $password: String!) {
          signup(email: $email, password: $password) {
            user {
              email
            }
          }
        }
      `;

      const context = await createContext({ 
        req: { headers: {} } 
      });

      const result = await server.executeOperation({
        query: signupQuery,
        variables: { email: 'invalid-email', password: 'password123' },
      }, { contextValue: context });

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].message).toBe('Invalid email format');
    });

    test('should validate password length', async () => {
      const signupQuery = `
        mutation Signup($email: String!, $password: String!) {
          signup(email: $email, password: $password) {
            user {
              email
            }
          }
        }
      `;

      const context = await createContext({ 
        req: { headers: {} } 
      });

      const result = await server.executeOperation({
        query: signupQuery,
        variables: { email: 'test@example.com', password: '123' },
      }, { contextValue: context });

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].message).toBe('Password must be at least 6 characters long');
    });
  });
}); 