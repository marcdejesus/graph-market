import { GraphQLError } from 'graphql';

export const requireAuth = (resolver) => {
  return (parent, args, context, info) => {
    if (!context.isAuthenticated) {
      throw new GraphQLError('Authentication required', {
        extensions: {
          code: 'UNAUTHENTICATED',
          http: { status: 401 },
        },
      });
    }
    return resolver(parent, args, context, info);
  };
};

export const requireAdmin = (resolver) => {
  return (parent, args, context, info) => {
    if (!context.isAuthenticated) {
      throw new GraphQLError('Authentication required', {
        extensions: {
          code: 'UNAUTHENTICATED',
          http: { status: 401 },
        },
      });
    }
    
    if (!context.isAdmin) {
      throw new GraphQLError('Admin access required', {
        extensions: {
          code: 'FORBIDDEN',
          http: { status: 403 },
        },
      });
    }
    
    return resolver(parent, args, context, info);
  };
};

export const requireCustomer = (resolver) => {
  return (parent, args, context, info) => {
    if (!context.isAuthenticated) {
      throw new GraphQLError('Authentication required', {
        extensions: {
          code: 'UNAUTHENTICATED',
          http: { status: 401 },
        },
      });
    }
    
    if (!context.isCustomer) {
      throw new GraphQLError('Customer access required', {
        extensions: {
          code: 'FORBIDDEN',
          http: { status: 403 },
        },
      });
    }
    
    return resolver(parent, args, context, info);
  };
};

export const requireOwnershipOrAdmin = (getResourceUserId) => {
  return (resolver) => {
    return async (parent, args, context, info) => {
      if (!context.isAuthenticated) {
        throw new GraphQLError('Authentication required', {
          extensions: {
            code: 'UNAUTHENTICATED',
            http: { status: 401 },
          },
        });
      }
      
      // Admin can access everything
      if (context.isAdmin) {
        return resolver(parent, args, context, info);
      }
      
      // Get the user ID that owns the resource
      const resourceUserId = await getResourceUserId(parent, args, context, info);
      
      if (context.user.id !== resourceUserId.toString()) {
        throw new GraphQLError('Access denied: You can only access your own resources', {
          extensions: {
            code: 'FORBIDDEN',
            http: { status: 403 },
          },
        });
      }
      
      return resolver(parent, args, context, info);
    };
  };
}; 