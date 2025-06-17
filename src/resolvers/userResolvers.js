import { GraphQLError } from 'graphql';
import { User } from '../models/User.js';
import { generateToken } from '../utils/auth.js';
import { validateEmail, validatePassword, validateObjectId } from '../utils/validation.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export const userResolvers = {
  Query: {
    // Get current user profile
    me: requireAuth(async (parent, args, context) => {
      return context.user;
    }),

    // Get all users (Admin only)
    users: requireAdmin(async (parent, { first = 20, after }, context) => {
      const limit = Math.min(first, 100);
      let query = User.find({ isActive: true });

      if (after) {
        const cursor = Buffer.from(after, 'base64').toString();
        query = query.where('_id').gt(cursor);
      }

      const users = await query
        .limit(limit + 1)
        .sort({ createdAt: -1 })
        .select('-password');

      return users.slice(0, limit);
    }),
  },

  Mutation: {
    // User signup
    signup: async (parent, { email, password, firstName, lastName }) => {
      try {
        // Validate input
        validateEmail(email);
        validatePassword(password);

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
          throw new GraphQLError('User with this email already exists', {
            extensions: {
              code: 'USER_ALREADY_EXISTS',
              field: 'email',
            },
          });
        }

        // Create new user
        const userData = {
          email: email.toLowerCase(),
          password,
          firstName: firstName?.trim(),
          lastName: lastName?.trim(),
        };

        const user = await User.create(userData);

        // Generate JWT token
        const token = generateToken(user._id);

        return {
          token,
          user,
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        // Handle MongoDB validation errors
        if (error.name === 'ValidationError') {
          const field = Object.keys(error.errors)[0];
          const message = error.errors[field].message;
          throw new GraphQLError(message, {
            extensions: {
              code: 'VALIDATION_ERROR',
              field,
            },
          });
        }

        throw new GraphQLError('Failed to create user account', {
          extensions: {
            code: 'INTERNAL_ERROR',
          },
        });
      }
    },

    // User login
    login: async (parent, { email, password }) => {
      try {
        // Validate input
        validateEmail(email);
        if (!password) {
          throw new GraphQLError('Password is required', {
            extensions: {
              code: 'INVALID_INPUT',
              field: 'password',
            },
          });
        }

        // Find user by email
        const user = await User.findOne({ 
          email: email.toLowerCase(),
          isActive: true 
        });

        if (!user) {
          throw new GraphQLError('Invalid email or password', {
            extensions: {
              code: 'INVALID_CREDENTIALS',
            },
          });
        }

        // Verify password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
          throw new GraphQLError('Invalid email or password', {
            extensions: {
              code: 'INVALID_CREDENTIALS',
            },
          });
        }

        // Generate JWT token
        const token = generateToken(user._id);

        return {
          token,
          user,
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Login failed', {
          extensions: {
            code: 'INTERNAL_ERROR',
          },
        });
      }
    },

    // Update user role (Admin only)
    updateUserRole: requireAdmin(async (parent, { userId, role }) => {
      try {
        validateObjectId(userId);

        const user = await User.findById(userId);
        if (!user) {
          throw new GraphQLError('User not found', {
            extensions: {
              code: 'USER_NOT_FOUND',
            },
          });
        }

        user.role = role.toLowerCase();
        await user.save();

        return user;
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Failed to update user role', {
          extensions: {
            code: 'INTERNAL_ERROR',
          },
        });
      }
    }),

    // Deactivate user (Admin only)
    deactivateUser: requireAdmin(async (parent, { userId }) => {
      try {
        validateObjectId(userId);

        const user = await User.findById(userId);
        if (!user) {
          throw new GraphQLError('User not found', {
            extensions: {
              code: 'USER_NOT_FOUND',
            },
          });
        }

        user.isActive = false;
        await user.save();

        return user;
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Failed to deactivate user', {
          extensions: {
            code: 'INTERNAL_ERROR',
          },
        });
      }
    }),
  },

  User: {
    // Transform role from lowercase to uppercase for GraphQL enum
    role: (user) => user.role.toUpperCase(),
    
    // Full name computed field
    fullName: (user) => {
      const parts = [user.firstName, user.lastName].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : null;
    },
  },
}; 