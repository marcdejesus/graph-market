import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';

export const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'graph-market',
      audience: 'graph-market-users'
    }
  );
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new GraphQLError('Token has expired', {
        extensions: {
          code: 'TOKEN_EXPIRED',
          http: { status: 401 },
        },
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      throw new GraphQLError('Invalid token', {
        extensions: {
          code: 'INVALID_TOKEN',
          http: { status: 401 },
        },
      });
    }
    
    throw new GraphQLError('Token verification failed', {
      extensions: {
        code: 'TOKEN_VERIFICATION_FAILED',
        http: { status: 401 },
      },
    });
  }
};

export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7);
}; 