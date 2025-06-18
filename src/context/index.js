import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { createDataLoaders } from '../services/dataLoaders.js';
import { userSessionCache } from '../services/userSessionCache.js';
import { performanceLogger } from '../utils/logging.js';

export const createContext = async ({ req }) => {
  const startTime = Date.now();
  let user = null;
  
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Create token hash for caching
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // Try to get cached token validation
      let cachedValidation = await userSessionCache.getTokenValidation(tokenHash);
      
      if (cachedValidation) {
        // Use cached validation
        user = await User.findById(cachedValidation.userId).select('-password');
        
        performanceLogger?.debug('Used cached token validation', {
          userId: cachedValidation.userId,
          tokenHash: tokenHash.substring(0, 8) + '...',
        });
      } else {
        // Verify token and cache result
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = await User.findById(decoded.userId).select('-password');
        
        if (user) {
          // Cache token validation
          await userSessionCache.setTokenValidation(tokenHash, {
            userId: user._id.toString(),
            role: user.role,
            isAdmin: user.role === 'admin',
          });
          
          // Cache user profile if not already cached
          const cachedProfile = await userSessionCache.getUserProfile(user._id.toString());
          if (!cachedProfile) {
            await userSessionCache.setUserProfile(user._id.toString(), user.toObject());
          }
          
          // Update user session
          await userSessionCache.setUserSession(user._id.toString(), {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            lastRequest: req.originalUrl,
          });
        }
      }
    }
  } catch (error) {
    // Token is invalid - user remains null
    performanceLogger?.warn('Authentication error', { 
      error: error.message,
      ip: req.ip,
    });
    
    // Track failed attempt if it's a token verification error
    if (req.headers.authorization) {
      await userSessionCache.trackFailedAttempt('token_verification', req.ip);
    }
  }
  
  // Create DataLoaders for this request
  const dataLoaders = createDataLoaders();
  
  // If we have a valid user, prime the user loader
  if (user) {
    dataLoaders.prime('user', user._id.toString(), user);
  }
  
  const duration = Date.now() - startTime;
  
  // Log context creation performance
  if (duration > 100) { // Log if context creation takes more than 100ms
    performanceLogger?.warn('Slow context creation', {
      duration,
      authenticated: !!user,
      userId: user?._id,
    });
  }

  return {
    req,
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isCustomer: user?.role === 'customer',
    userId: user?._id?.toString(),
    
    // DataLoaders for efficient data fetching
    dataLoaders,
    
    // Caching services
    userSessionCache,
    
    // Performance tracking
    performance: {
      contextCreationTime: duration,
      requestStartTime: startTime,
    },
  };
}; 