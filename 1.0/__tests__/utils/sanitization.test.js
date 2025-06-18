import {
  sanitizeString,
  sanitizeEmail,
  sanitizeName,
  sanitizeObject,
  validateNoSQLInjection,
  normalizeText
} from '../../src/utils/sanitization.js';
import { GraphQLError } from 'graphql';

describe('Sanitization Utils', () => {
  describe('sanitizeString', () => {
    it('should remove null bytes', () => {
      const input = 'test\0string';
      const result = sanitizeString(input);
      expect(result).toBe('teststring');
    });

    it('should trim whitespace', () => {
      const input = '  test string  ';
      const result = sanitizeString(input);
      expect(result).toBe('test string');
    });

    it('should limit length', () => {
      const input = 'a'.repeat(300);
      const result = sanitizeString(input, 100);
      expect(result).toHaveLength(100);
    });

    it('should remove script tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = sanitizeString(input);
      expect(result).toBe('Hello');
    });

    it('should remove javascript protocol', () => {
      const input = 'javascript:alert("xss")';
      const result = sanitizeString(input);
      expect(result).toBe('alert("xss")');
    });

    it('should remove event handlers from text', () => {
      const input = 'Hello onclick=alert("xss") world';
      const result = sanitizeString(input);
      expect(result).toBe('Hello  world');
    });

    it('should remove standalone event handlers', () => {
      const input = 'onload=malicious()';
      const result = sanitizeString(input);
      expect(result).toBe('');
    });

    it('should handle non-string input', () => {
      expect(sanitizeString(null)).toBe(null);
      expect(sanitizeString(undefined)).toBe(undefined);
      expect(sanitizeString(123)).toBe(123);
    });
  });

  describe('sanitizeEmail', () => {
    it('should convert to lowercase and trim', () => {
      const input = '  TEST@EXAMPLE.COM  ';
      const result = sanitizeEmail(input);
      expect(result).toBe('test@example.com');
    });

    it('should remove invalid characters', () => {
      const input = 'test+user@example.com';
      const result = sanitizeEmail(input);
      expect(result).toBe('testuser@example.com');
    });

    it('should throw error for too long email', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(() => sanitizeEmail(longEmail)).toThrow(GraphQLError);
    });

    it('should handle non-string input', () => {
      expect(sanitizeEmail(null)).toBe(null);
      expect(sanitizeEmail(undefined)).toBe(undefined);
    });
  });

  describe('sanitizeName', () => {
    it('should remove non-letter characters except allowed ones', () => {
      const input = "John123 O'Connor-Smith";
      const result = sanitizeName(input);
      expect(result).toBe("John O'Connor-Smith");
    });

    it('should trim and limit length', () => {
      const input = '  ' + 'a'.repeat(60) + '  ';
      const result = sanitizeName(input);
      expect(result).toHaveLength(50);
    });

    it('should handle names with leading numbers by removing them', () => {
      const input = '123John';
      const result = sanitizeName(input);
      expect(result).toBe('John'); // Numbers removed, leaving valid name
    });

    it('should throw error if name has no letters after cleaning', () => {
      const input = '123456';
      expect(() => sanitizeName(input)).toThrow(GraphQLError);
    });

    it('should handle non-string input', () => {
      expect(sanitizeName(null)).toBe(null);
      expect(sanitizeName(undefined)).toBe(undefined);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize fields according to rules', () => {
      const obj = {
        email: '  TEST@EXAMPLE.COM  ',
        name: "John123 O'Connor",
        description: '<script>alert("xss")</script>Hello'
      };

      const rules = {
        email: { type: 'email' },
        name: { type: 'name' },
        description: { type: 'string', maxLength: 100 }
      };

      const result = sanitizeObject(obj, rules);

      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe("John O'Connor");
      expect(result.description).toBe('Hello');
    });

    it('should handle non-object input', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });
  });

  describe('validateNoSQLInjection', () => {
    it('should detect SQL injection patterns', () => {
      const patterns = [
        'SELECT * FROM users',
        'DROP TABLE users',
        'test OR 1=1',
        'test; DELETE FROM users',
        'test -- comment',
        'test /* comment */',
        'test | ls',
        'test & whoami'
      ];

      patterns.forEach(pattern => {
        expect(() => validateNoSQLInjection(pattern, 'test')).toThrow(GraphQLError);
      });
    });

    it('should allow safe strings', () => {
      const safeStrings = [
        'john@example.com',
        'John Smith',
        'Product description',
        'Hello world'
      ];

      safeStrings.forEach(str => {
        expect(() => validateNoSQLInjection(str, 'test')).not.toThrow();
      });
    });

    it('should handle non-string input', () => {
      expect(() => validateNoSQLInjection(null)).not.toThrow();
      expect(() => validateNoSQLInjection(undefined)).not.toThrow();
    });
  });

  describe('normalizeText', () => {
    it('should replace multiple whitespace with single space', () => {
      const input = 'Hello    world\n\ntest\t\tstring';
      const result = normalizeText(input);
      expect(result).toBe('Hello world test string');
    });

    it('should trim leading and trailing whitespace', () => {
      const input = '  Hello world  ';
      const result = normalizeText(input);
      expect(result).toBe('Hello world');
    });

    it('should handle non-string input', () => {
      expect(normalizeText(null)).toBe(null);
      expect(normalizeText(undefined)).toBe(undefined);
    });
  });
}); 