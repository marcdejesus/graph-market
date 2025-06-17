import { describe, test, expect, beforeAll } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { generateToken, verifyToken, extractTokenFromHeader } from '../../src/utils/auth.js';

describe('Auth Utils', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    process.env.JWT_EXPIRES_IN = '7d';
  });

  describe('generateToken', () => {
    test('should generate a valid JWT token', () => {
      const userId = '507f1f77bcf86cd799439011';
      const token = generateToken(userId);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature

      // Verify the token can be decoded
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(userId);
      expect(decoded.iss).toBe('graph-market');
      expect(decoded.aud).toBe('graph-market-users');
    });

    test('should throw error if JWT_SECRET is not defined', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => generateToken('test-id')).toThrow('JWT_SECRET is not defined');

      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('verifyToken', () => {
    test('should verify a valid token', () => {
      const userId = '507f1f77bcf86cd799439011';
      const token = generateToken(userId);

      const decoded = verifyToken(token);
      expect(decoded.userId).toBe(userId);
    });

    test('should throw GraphQLError for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => verifyToken(invalidToken)).toThrow('Invalid token');
    });

    test('should throw GraphQLError for expired token', () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: 'test-id' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      expect(() => verifyToken(expiredToken)).toThrow('Token has expired');
    });
  });

  describe('extractTokenFromHeader', () => {
    test('should extract token from Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const authHeader = `Bearer ${token}`;

      const extracted = extractTokenFromHeader(authHeader);
      expect(extracted).toBe(token);
    });

    test('should return null for invalid header format', () => {
      expect(extractTokenFromHeader('InvalidHeader')).toBeNull();
      expect(extractTokenFromHeader('Basic token')).toBeNull();
      expect(extractTokenFromHeader('')).toBeNull();
      expect(extractTokenFromHeader(null)).toBeNull();
      expect(extractTokenFromHeader(undefined)).toBeNull();
    });

    test('should return null for missing header', () => {
      expect(extractTokenFromHeader()).toBeNull();
    });
  });
}); 