import { GraphQLError } from 'graphql';
import { Order } from '../models/Order.js';
import { OrderService } from '../services/orderService.js';
import { logger } from '../utils/logging.js';
import { verifyToken } from '../utils/auth.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export const orderResolvers = {
  Query: {
    /**
     * Get current user's orders
     */
    myOrders: requireAuth(async (parent, args, context) => {
      try {
        const result = await OrderService.getOrdersPaginated(
          { userId: context.user._id.toString() },
          { first: args.first, after: args.after }
        );

        logger.info('User orders retrieved', {
          userId: context.user._id,
          orderCount: result.orders.length
        });

        return result.orders;
      } catch (error) {
        logger.error('myOrders query failed', {
          error: error.message,
          userId: context.user?._id
        });
        throw error;
      }
    }),

    /**
     * Get a specific order by ID
     */
    order: requireAuth(async (parent, { id }, context) => {
      try {
        const order = await Order.findById(id)
          .populate('user', 'email firstName lastName')
          .populate('items.product', 'name price imageUrl category');

        if (!order) {
          throw new GraphQLError('Order not found', {
            extensions: { code: 'ORDER_NOT_FOUND' }
          });
        }

        // Users can only view their own orders, admins can view any order
        if (!context.isAdmin && order.user._id.toString() !== context.user._id.toString()) {
          throw new GraphQLError('Not authorized to view this order', {
            extensions: { code: 'UNAUTHORIZED' }
          });
        }

        logger.info('Order retrieved', {
          orderId: id,
          userId: context.user._id,
          userRole: context.user.role
        });

        return order;
      } catch (error) {
        logger.error('order query failed', {
          error: error.message,
          orderId: id,
          userId: context.user?._id
        });
        throw error;
      }
    }),

    /**
     * Get all orders (admin only) with filtering and pagination
     */
    allOrders: requireAdmin(async (parent, args, context) => {
      try {
        const filters = {};
        if (args.status) {
          filters.status = args.status;
        }

        const result = await OrderService.getOrdersPaginated(
          filters,
          { first: args.first, after: args.after }
        );

        logger.info('All orders retrieved', {
          adminId: context.user._id,
          orderCount: result.orders.length,
          filters
        });

        return result.orders;
      } catch (error) {
        logger.error('allOrders query failed', {
          error: error.message,
          userId: context.user?._id,
          args
        });
        throw error;
      }
    }),

    /**
     * Get order analytics (admin only)
     */
    orderStats: requireAdmin(async (parent, args, context) => {
      try {
        const stats = await OrderService.getOrderAnalytics();

        logger.info('Order analytics retrieved', {
          adminId: context.user._id,
          totalOrders: stats.totalOrders,
          totalRevenue: stats.totalRevenue
        });

        return stats;
      } catch (error) {
        logger.error('orderStats query failed', {
          error: error.message,
          userId: context.user?._id
        });
        throw error;
      }
    }),
  },

  Mutation: {
    /**
     * Place a new order
     */
    placeOrder: requireAuth(async (parent, { input }, context) => {
      try {
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

        const order = await OrderService.createOrder(context.user._id.toString(), input);

        // Populate the created order for response
        const populatedOrder = await Order.findById(order._id)
          .populate('user', 'email firstName lastName')
          .populate('items.product', 'name price imageUrl category');

        logger.info('Order placed successfully', {
          orderId: order._id,
          userId: context.user._id,
          totalAmount: order.totalAmount,
          itemCount: order.items.length
        });

        return populatedOrder;
      } catch (error) {
        logger.error('placeOrder mutation failed', {
          error: error.message,
          userId: context.user?._id,
          input
        });
        throw error;
      }
    }),

    /**
     * Cancel an order
     */
    cancelOrder: requireAuth(async (parent, { orderId }, context) => {
      try {
        const updatedOrder = await OrderService.cancelOrder(
          orderId, 
          context.user._id.toString(), 
          context.user.role
        );

        // Populate the updated order for response
        const populatedOrder = await Order.findById(updatedOrder._id)
          .populate('user', 'email firstName lastName')
          .populate('items.product', 'name price imageUrl category');

        logger.info('Order cancelled successfully', {
          orderId,
          userId: context.user._id,
          userRole: context.user.role
        });

        return populatedOrder;
      } catch (error) {
        logger.error('cancelOrder mutation failed', {
          error: error.message,
          orderId,
          userId: context.user?._id
        });
        throw error;
      }
    }),

    /**
     * Update order status (admin only)
     */
    updateOrderStatus: requireAdmin(async (parent, { orderId, status }, context) => {
      try {
        const updatedOrder = await OrderService.updateOrderStatus(orderId, status);

        // Populate the updated order for response
        const populatedOrder = await Order.findById(updatedOrder._id)
          .populate('user', 'email firstName lastName')
          .populate('items.product', 'name price imageUrl category');

        logger.info('Order status updated successfully', {
          orderId,
          newStatus: status,
          adminId: context.user._id
        });

        return populatedOrder;
      } catch (error) {
        logger.error('updateOrderStatus mutation failed', {
          error: error.message,
          orderId,
          status,
          adminId: context.user?._id
        });
        throw error;
      }
    }),
  },

  // Field resolvers
  Order: {
    // Ensure user is always populated
    user: async (order) => {
      if (order.user && typeof order.user === 'object' && order.user.email) {
        return order.user;
      }
      
      const { User } = await import('../models/User.js');
      return await User.findById(order.user).select('email firstName lastName role');
    },

    // Ensure items are populated with product details
    items: async (order) => {
      if (order.items && order.items[0]?.product?.name) {
        return order.items;
      }

      const { Product } = await import('../models/Product.js');
      const populatedOrder = await Order.findById(order._id)
        .populate('items.product', 'name price imageUrl category');
      
      return populatedOrder.items;
    },

    // Generate order number from ID
    orderNumber: (order) => {
      return `ORD-${order._id.toString().slice(-8).toUpperCase()}`;
    },

    // Transform status to uppercase for consistency
    status: (order) => order.status.toUpperCase(),
  },

  // Order item field resolvers
  OrderItem: {
    product: async (item) => {
      if (item.product && typeof item.product === 'object' && item.product.name) {
        return item.product;
      }
      
      const { Product } = await import('../models/Product.js');
      return await Product.findById(item.product);
    },
  },
}; 