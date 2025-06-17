import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export const createContext = async ({ req }) => {
  let user = null;
  
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Verify and decode token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Find user by ID from token
      user = await User.findById(decoded.userId).select('-password');
    }
  } catch (error) {
    // Token is invalid - user remains null
    console.log('Invalid token:', error.message);
  }

  return {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isCustomer: user?.role === 'customer',
  };
}; 