import { GraphQLError } from 'graphql';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { verifyToken } from '../utils/auth.js';
import { OrderService } from '../services/orderService.js';
import { logger } from '../utils/logging.js';

// Helper function to authenticate user
const authenticate = (context) => {
  const token = context.token;
  if (!token) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
  return verifyToken(token);
};

// Helper function to check admin role
const requireAdmin = (user) => {
  if (user.role !== 'admin') {
    throw new GraphQLError('Admin access required', {
      extensions: { code: 'FORBIDDEN' }
    });
  }
};

export const orderResolvers = {
  Query: {
    /**
     * Get current user's orders
     */
    myOrders: async (parent, args, context) => {
      try {
        const user = authenticate(context);
        
        const result = await OrderService.getOrdersPaginated(
          { userId: user.userId },
          { first: args.first, after: args.after }
        );

        logger.info('User orders retrieved', {
          userId: user.userId,
          orderCount: result.orders.length
        });

        return result.orders;
      } catch (error) {
        logger.error('myOrders query failed', {
          error: error.message,
          userId: context.user?.id
        });
        throw error;
      }
    },

    /**
     * Get a specific order by ID
     */
    order: async (parent, { id }, context) => {
      try {
        const user = authenticate(context);
        
        const order = await Order.findById(id)
          .populate('user', 'email firstName lastName')
          .populate('items.product', 'name price imageUrl category');

        if (!order) {
          throw new GraphQLError('Order not found', {
            extensions: { code: 'ORDER_NOT_FOUND' }
          });
        }

        // Users can only view their own orders, admins can view any order
        if (user.role !== 'admin' && order.user._id.toString() !== user.userId) {
          throw new GraphQLError('Not authorized to view this order', {
            extensions: { code: 'UNAUTHORIZED' }
          });
        }

        logger.info('Order retrieved', {
          orderId: id,
          userId: user.userId,
          userRole: user.role
        });

        return order;
      } catch (error) {
        logger.error('order query failed', {
          error: error.message,
          orderId: id,
          userId: context.user?.id
        });
        throw error;
      }
    },

    /**
     * Get all orders (admin only) with filtering and pagination
     */
    allOrders: async (parent, args, context) => {
      try {
        const user = authenticate(context);
        requireAdmin(user);

        const filters = {};
        if (args.status) {
          filters.status = args.status;
        }

        const result = await OrderService.getOrdersPaginated(
          filters,
          { first: args.first, after: args.after }
        );

        logger.info('All orders retrieved', {
          adminId: user.userId,
          orderCount: result.orders.length,
          filters
        });

        return result.orders;
      } catch (error) {
        logger.error('allOrders query failed', {
          error: error.message,
          userId: context.user?.id,
          args
        });
        throw error;
      }
    },

    /**
     * Get order analytics (admin only)
     */
    orderStats: async (parent, args, context) => {
      try {
        const user = authenticate(context);
        requireAdmin(user);

        const stats = await OrderService.getOrderAnalytics();

        logger.info('Order analytics retrieved', {
          adminId: user.userId,
          totalOrders: stats.totalOrders,
          totalRevenue: stats.totalRevenue
        });

        return stats;
      } catch (error) {
        logger.error('orderStats query failed', {
          error: error.message,
          userId: context.user?.id
        });
        throw error;
      }
    },
  },

  Mutation: {
    /**
     * Place a new order
     */
    placeOrder: async (parent, { input }, context) => {
      try {
        const user = authenticate(context);

        // Validate input
        if (!input.items || input.items.length === 0) {
          throw new GraphQLError('Order must contain at least one item', {
            extensions: { code: 'VALIDATION_ERROR' }
          });
        }

        // Validate each item
        for (const item of input.items) {
          if (!item.productId || !item.quantity || item.quantity < 1) {
            throw new GraphQLError('Invalid order item: productId and quantity (>0) are required', {
              extensions: { code: 'VALIDATION_ERROR' }
            });
          }
        }

        const order = await OrderService.createOrder(user.userId, input);

        // Populate the created order for response
        const populatedOrder = await Order.findById(order._id)
          .populate('user', 'email firstName lastName')
          .populate('items.product', 'name price imageUrl category');

        logger.info('Order placed successfully', {
          orderId: order._id,
          userId: user.userId,
          totalAmount: order.totalAmount,
          itemCount: order.items.length
        });

        return populatedOrder;
      } catch (error) {
        logger.error('placeOrder mutation failed', {
          error: error.message,
          userId: context.user?.id,
          input
        });
        throw error;
      }
    },

    /**
     * Cancel an order (customer can cancel their own, admin can cancel any)
     */
    cancelOrder: async (parent, { orderId }, context) => {
      try {
        const user = authenticate(context);

        const cancelledOrder = await OrderService.cancelOrder(orderId, user.userId, user.role);

        // Populate the cancelled order for response
        const populatedOrder = await Order.findById(cancelledOrder._id)
          .populate('user', 'email firstName lastName')
          .populate('items.product', 'name price imageUrl category');

        logger.info('Order cancelled', {
          orderId,
          userId: user.userId,
          userRole: user.role
        });

        return populatedOrder;
      } catch (error) {
        logger.error('cancelOrder mutation failed', {
          error: error.message,
          orderId,
          userId: context.user?.id
        });
        throw error;
      }
    },

    /**
     * Update order status (admin only)
     */
    updateOrderStatus: async (parent, { orderId, status }, context) => {
      try {
        const user = authenticate(context);
        requireAdmin(user);

        // Convert GraphQL enum to lowercase for database
        const dbStatus = status.toLowerCase();

        const updatedOrder = await OrderService.updateOrderStatus(orderId, dbStatus, user.userId);

        // Populate the updated order for response
        const populatedOrder = await Order.findById(updatedOrder._id)
          .populate('user', 'email firstName lastName')
          .populate('items.product', 'name price imageUrl category');

        logger.info('Order status updated', {
          orderId,
          newStatus: dbStatus,
          adminId: user.userId
        });

        return populatedOrder;
      } catch (error) {
        logger.error('updateOrderStatus mutation failed', {
          error: error.message,
          orderId,
          status,
          userId: context.user?.id
        });
        throw error;
      }
    },
  },

  Subscription: {
    orderStatusUpdated: {
      subscribe: () => {
        throw new GraphQLError('Subscriptions not yet implemented');
      },
    },

    newOrder: {
      subscribe: () => {
        throw new GraphQLError('Subscriptions not yet implemented');
      },
    },
  },

  // Field resolvers for Order type
  Order: {
    user: async (order) => {
      if (order.user && typeof order.user === 'object' && order.user.email) {
        // Already populated
        return order.user;
      }
      
      // Need to populate
      const user = await User.findById(order.user).select('email firstName lastName role');
      return user;
    },

    items: async (order) => {
      if (order.items && order.items.length > 0 && order.items[0].product && typeof order.items[0].product === 'object') {
        // Already populated
        return order.items;
      }

      // Need to populate
      const populatedOrder = await Order.findById(order._id).populate('items.product', 'name price imageUrl category');
      return populatedOrder.items;
    },

    orderNumber: (order) => {
      return `ORD-${order._id.toString().slice(-8).toUpperCase()}`;
    },

    status: (order) => {
      // Convert to GraphQL enum format (uppercase)
      return order.status.toUpperCase();
    },

    paymentStatus: (order) => {
      // Convert to GraphQL enum format (uppercase)
      return order.paymentStatus.toUpperCase();
    },
  },

  // Field resolvers for OrderItem type
  OrderItem: {
    product: async (orderItem) => {
      if (orderItem.product && typeof orderItem.product === 'object' && orderItem.product.name) {
        // Already populated
        return orderItem.product;
      }

      // Need to populate
      const { Product } = await import('../models/Product.js');
      const product = await Product.findById(orderItem.product);
      return product;
    },
  },
}; 