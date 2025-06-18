import { GraphQLError } from 'graphql';

/**
 * Sanitize string input to prevent XSS attacks
 * @param {string} input - The input string to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Sanitized string
 */
export const sanitizeString = (input, maxLength = 255) => {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Remove potentially dangerous characters for basic protection
  // Note: For production, consider using a proper HTML sanitization library
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=.*?(?=\s|$|>)/gi, ''); // Remove event handlers and their values
  
  return sanitized;
};

/**
 * Sanitize email input
 * @param {string} email - The email to sanitize
 * @returns {string} - Sanitized email
 */
export const sanitizeEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return email;
  }

  // Convert to lowercase and trim
  let sanitized = email.toLowerCase().trim();
  
  // Remove any characters that shouldn't be in an email
  sanitized = sanitized.replace(/[^\w@.-]/g, '');
  
  // Limit length (emails shouldn't be longer than 254 characters per RFC)
  if (sanitized.length > 254) {
    throw new GraphQLError('Email address is too long', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'email',
      },
    });
  }
  
  return sanitized;
};

/**
 * Sanitize name fields (firstName, lastName)
 * @param {string} name - The name to sanitize
 * @returns {string} - Sanitized name
 */
export const sanitizeName = (name) => {
  if (!name || typeof name !== 'string') {
    return name;
  }

  // Remove any non-letter characters except spaces, hyphens, and apostrophes
  let sanitized = name.replace(/[^a-zA-Z\s'-]/g, '');
  
  // Trim and limit length
  sanitized = sanitized.trim().substring(0, 50);
  
  // Check if there's any meaningful content left after cleaning
  if (sanitized.length === 0 || !/[a-zA-Z]/.test(sanitized)) {
    throw new GraphQLError('Name must contain at least one letter', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'name',
      },
    });
  }
  
  // Ensure it starts with a letter
  if (!/^[a-zA-Z]/.test(sanitized)) {
    throw new GraphQLError('Name must start with a letter', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'name',
      },
    });
  }
  
  return sanitized;
};

/**
 * Sanitize object with multiple fields
 * @param {object} obj - Object to sanitize
 * @param {object} fieldRules - Rules for each field
 * @returns {object} - Sanitized object
 */
export const sanitizeObject = (obj, fieldRules = {}) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = { ...obj };

  Object.keys(fieldRules).forEach(field => {
    if (sanitized[field] !== undefined) {
      const rule = fieldRules[field];
      
      switch (rule.type) {
        case 'string':
          sanitized[field] = sanitizeString(sanitized[field], rule.maxLength);
          break;
        case 'email':
          sanitized[field] = sanitizeEmail(sanitized[field]);
          break;
        case 'name':
          sanitized[field] = sanitizeName(sanitized[field]);
          break;
        default:
          // Keep as is for unknown types
          break;
      }
    }
  });

  return sanitized;
};

/**
 * Validate that a string doesn't contain SQL injection patterns
 * @param {string} input - Input to validate
 * @param {string} fieldName - Field name for error reporting
 */
export const validateNoSQLInjection = (input, fieldName = 'input') => {
  if (!input || typeof input !== 'string') {
    return;
  }

  // Basic SQL injection patterns to detect
  const sqlPatterns = [
    /(\bunion\b|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bcreate\b|\balter\b)/i,
    /(-{2}|\/\*|\*\/)/,
    /(\bor\b|\band\b)\s+[\w\s]*\s*(=|like)/i,
    /(;|\||&)/
  ];

  const containsSQLPattern = sqlPatterns.some(pattern => pattern.test(input));
  
  if (containsSQLPattern) {
    throw new GraphQLError(`Invalid characters detected in ${fieldName}`, {
      extensions: {
        code: 'INVALID_INPUT',
        field: fieldName,
      },
    });
  }
};

/**
 * Remove excessive whitespace and normalize text
 * @param {string} text - Text to normalize
 * @returns {string} - Normalized text
 */
export const normalizeText = (text) => {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return text
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .trim(); // Remove leading/trailing whitespace
}; 