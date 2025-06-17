import { GraphQLError } from 'graphql';

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new GraphQLError('Invalid email format', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'email',
      },
    });
  }
};

export const validatePassword = (password) => {
  if (!password || password.length < 6) {
    throw new GraphQLError('Password must be at least 6 characters long', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'password',
      },
    });
  }
  
  // Optional: Add more password complexity requirements
  // const hasUpperCase = /[A-Z]/.test(password);
  // const hasLowerCase = /[a-z]/.test(password);
  // const hasNumbers = /\d/.test(password);
  // const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
};

export const validateObjectId = (id) => {
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  if (!objectIdRegex.test(id)) {
    throw new GraphQLError('Invalid ID format', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'id',
      },
    });
  }
};

export const validatePrice = (price) => {
  if (typeof price !== 'number' || price < 0 || !Number.isFinite(price)) {
    throw new GraphQLError('Price must be a valid positive number', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'price',
      },
    });
  }
};

export const validateStock = (stock) => {
  if (!Number.isInteger(stock) || stock < 0) {
    throw new GraphQLError('Stock must be a non-negative integer', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'stock',
      },
    });
  }
};

export const validateQuantity = (quantity) => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new GraphQLError('Quantity must be a positive integer', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'quantity',
      },
    });
  }
};

export const sanitizeString = (str, maxLength = 255) => {
  if (!str) return str;
  return str.trim().substring(0, maxLength);
};

export const validatePaginationArgs = (first, after) => {
  if (first && (first < 1 || first > 100)) {
    throw new GraphQLError('First argument must be between 1 and 100', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'first',
      },
    });
  }
  
  if (after && !Buffer.from(after, 'base64').toString()) {
    throw new GraphQLError('Invalid cursor format', {
      extensions: {
        code: 'INVALID_INPUT',
        field: 'after',
      },
    });
  }
}; 