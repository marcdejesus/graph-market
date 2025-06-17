import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { logger } from '../utils/logging.js';

// Check if we're in test environment to disable transactions
const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;

export class OrderService {
  // Valid order status transitions
  static VALID_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: []
  };

  /**
   * Validate if order status transition is allowed
   */
  static isValidStatusTransition(currentStatus, newStatus) {
    const allowedTransitions = this.VALID_TRANSITIONS[currentStatus];
    return allowedTransitions ? allowedTransitions.includes(newStatus) : false;
  }

  /**
   * Calculate order total from items
   */
  static calculateOrderTotal(items) {
    return items.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
  }

  /**
   * Validate stock availability for order items
   */
  static async validateStockAvailability(orderItems) {
    const validationResults = [];
    
    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      
      if (!product) {
        throw new GraphQLError(`Product with ID ${item.productId} not found`, {
          extensions: { code: 'PRODUCT_NOT_FOUND' }
        });
      }

      if (!product.isActive) {
        throw new GraphQLError(`Product "${product.name}" is not available for purchase`, {
          extensions: { code: 'PRODUCT_INACTIVE' }
        });
      }

      if (product.stock < item.quantity) {
        throw new GraphQLError(
          `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`,
          { extensions: { code: 'INSUFFICIENT_STOCK' } }
        );
      }

      validationResults.push({
        product,
        requestedQuantity: item.quantity,
        availableStock: product.stock
      });
    }

    return validationResults;
  }

  /**
   * Helper function to execute with or without transaction
   */
  static async executeWithOptionalTransaction(operation) {
    if (isTestEnvironment) {
      // Execute without transaction in test environment
      return await operation();
    } else {
      // Use transaction in production
      const session = await mongoose.startSession();
      try {
        return await session.withTransaction(operation);
      } finally {
        await session.endSession();
      }
    }
  }

  /**
   * Create a new order with stock validation and inventory deduction
   */
  static async createOrder(userId, orderInput) {
    try {
      return await this.executeWithOptionalTransaction(async () => {
        // Validate stock availability
        const validationResults = await this.validateStockAvailability(orderInput.items);
        
        // Build order items with current product prices
        const orderItems = validationResults.map(result => ({
          product: result.product._id,
          quantity: result.requestedQuantity,
          price: result.product.price
        }));

        // Calculate total
        const totalAmount = this.calculateOrderTotal(orderItems);

        // Create order
        const order = new Order({
          user: userId,
          items: orderItems,
          totalAmount,
          shippingAddress: orderInput.shippingAddress,
          notes: orderInput.notes
        });

        await order.save();

        // Deduct stock for each product
        for (const result of validationResults) {
          await Product.findByIdAndUpdate(
            result.product._id,
            { $inc: { stock: -result.requestedQuantity } }
          );
        }

        logger.info('Order created successfully', {
          orderId: order._id,
          userId,
          totalAmount,
          itemCount: orderItems.length
        });

        return order;
      });
    } catch (error) {
      logger.error('Order creation failed', {
        error: error.message,
        userId,
        orderInput
      });
      throw error;
    }
  }

  /**
   * Cancel an order and restore inventory
   */
  static async cancelOrder(orderId, userId, userRole) {
    try {
      return await this.executeWithOptionalTransaction(async () => {
        const order = await Order.findById(orderId).populate('items.product');
        
        if (!order) {
          throw new GraphQLError('Order not found', {
            extensions: { code: 'ORDER_NOT_FOUND' }
          });
        }

        // Check authorization (customer can only cancel their own orders)
        if (userRole !== 'admin' && order.user.toString() !== userId) {
          throw new GraphQLError('Not authorized to cancel this order', {
            extensions: { code: 'UNAUTHORIZED' }
          });
        }

        // Check if order can be cancelled
        if (!this.isValidStatusTransition(order.status, 'cancelled')) {
          throw new GraphQLError(
            `Cannot cancel order with status "${order.status}"`,
            { extensions: { code: 'INVALID_STATUS_TRANSITION' } }
          );
        }

        // Update order status
        order.status = 'cancelled';
        await order.save();

        // Restore inventory for each item
        for (const item of order.items) {
          await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { stock: item.quantity } }
          );
        }

        logger.info('Order cancelled successfully', {
          orderId,
          userId,
          userRole,
          restoredItems: order.items.length
        });

        return order;
      });
    } catch (error) {
      logger.error('Order cancellation failed', {
        error: error.message,
        orderId,
        userId
      });
      throw error;
    }
  }

  /**
   * Update order status (admin only)
   */
  static async updateOrderStatus(orderId, newStatus, adminUserId) {
    try {
      const order = await Order.findById(orderId);
      
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'ORDER_NOT_FOUND' }
        });
      }

      // Validate status transition
      if (!this.isValidStatusTransition(order.status, newStatus)) {
        throw new GraphQLError(
          `Invalid status transition from "${order.status}" to "${newStatus}"`,
          { extensions: { code: 'INVALID_STATUS_TRANSITION' } }
        );
      }

      const oldStatus = order.status;
      order.status = newStatus;
      await order.save();

      logger.info('Order status updated', {
        orderId,
        oldStatus,
        newStatus,
        adminUserId
      });

      return order;
    } catch (error) {
      logger.error('Order status update failed', {
        error: error.message,
        orderId,
        newStatus,
        adminUserId
      });
      throw error;
    }
  }

  /**
   * Get order analytics (admin only)
   */
  static async getOrderAnalytics() {
    try {
      const [totalOrdersResult, totalRevenueResult, ordersByStatusResult] = await Promise.all([
        Order.countDocuments(),
        Order.aggregate([
          { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
        ]),
        Order.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      ]);

      const totalOrders = totalOrdersResult;
      const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      
      const ordersByStatus = ordersByStatusResult.map(item => ({
        status: item._id.toUpperCase(),
        count: item.count
      }));

      return {
        totalOrders,
        totalRevenue,
        averageOrderValue,
        ordersByStatus
      };
    } catch (error) {
      logger.error('Order analytics calculation failed', {
        error: error.message
      });
      throw new GraphQLError('Failed to calculate order analytics');
    }
  }

  /**
   * Get paginated orders with filtering
   */
  static async getOrdersPaginated(filters = {}, pagination = {}) {
    try {
      const { status, userId } = filters;
      const { first = 20, after } = pagination;

      // Build query
      const query = {};
      if (status) {
        query.status = status.toLowerCase();
      }
      if (userId) {
        query.user = userId;
      }

      // Handle cursor-based pagination
      if (after) {
        const cursorOrder = await Order.findById(after);
        if (cursorOrder) {
          query.createdAt = { $lt: cursorOrder.createdAt };
        }
      }

      const orders = await Order.find(query)
        .populate('user', 'email firstName lastName')
        .populate('items.product', 'name price imageUrl')
        .sort({ createdAt: -1 })
        .limit(first + 1); // Get one extra to check if there are more

      const hasMore = orders.length > first;
      const ordersToReturn = hasMore ? orders.slice(0, first) : orders;

      return {
        orders: ordersToReturn,
        hasMore,
        totalCount: await Order.countDocuments(userId ? { user: userId } : {})
      };
    } catch (error) {
      logger.error('Order pagination failed', {
        error: error.message,
        filters,
        pagination
      });
      throw new GraphQLError('Failed to retrieve orders');
    }
  }
} 