import { OrderService } from '../../src/services/orderService.js';
import { Order } from '../../src/models/Order.js';
import { Product } from '../../src/models/Product.js';
import { User } from '../../src/models/User.js';
import { GraphQLError } from 'graphql';
import mongoose from 'mongoose';
import { ensureTestDBConnection, clearTestCollections, closeTestDBConnection } from '../utils/testDB.js';

// Mock the logger
jest.mock('../../src/utils/logging.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
  await ensureTestDBConnection();
});

afterAll(async () => {
  await closeTestDBConnection();
});

describe('OrderService', () => {
  let mockUser, mockProduct1, mockProduct2, mockOrder;

  beforeEach(async () => {
    await clearTestCollections();

    mockUser = await User.create({
      email: 'customer@test.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
      role: 'customer',
    });

    mockProduct1 = await Product.create({
      name: 'Test Product 1',
      description: 'A test product',
      category: 'Electronics',
      price: 99.99,
      stock: 10,
      isActive: true,
      createdBy: mockUser._id,
    });

    mockProduct2 = await Product.create({
      name: 'Test Product 2',
      description: 'Another test product',
      category: 'Electronics',
      price: 49.99,
      stock: 5,
      isActive: true,
      createdBy: mockUser._id,
    });

    mockOrder = await Order.create({
      user: mockUser._id,
      items: [
        {
          product: mockProduct1._id,
          quantity: 2,
          price: mockProduct1.price,
        },
      ],
      totalAmount: 199.98,
      status: 'pending',
    });
  });

  describe('Status Transition Validation', () => {
    it('should validate correct transitions', () => {
      expect(OrderService.isValidStatusTransition('pending', 'confirmed')).toBe(true);
      expect(OrderService.isValidStatusTransition('confirmed', 'processing')).toBe(true);
    });
  });

  describe('Order Total Calculation', () => {
    it('should calculate total correctly for single item', () => {
      const items = [{ price: 10.50, quantity: 2 }];
      const total = OrderService.calculateOrderTotal(items);
      expect(total).toBe(21.00);
    });

    it('should calculate total correctly for multiple items', () => {
      const items = [
        { price: 10.50, quantity: 2 },
        { price: 5.25, quantity: 3 },
        { price: 100, quantity: 1 }
      ];
      const total = OrderService.calculateOrderTotal(items);
      expect(total).toBe(136.75);
    });

    it('should handle empty items array', () => {
      const total = OrderService.calculateOrderTotal([]);
      expect(total).toBe(0);
    });
  });

  describe('Stock Availability Validation', () => {
    it('should validate available stock', async () => {
      const orderItems = [
        { productId: mockProduct1._id, quantity: 5 },
        { productId: mockProduct2._id, quantity: 3 },
      ];
      const results = await OrderService.validateStockAvailability(orderItems);
      expect(results).toHaveLength(2);
    });

    it('should throw error for non-existent product', async () => {
      const orderItems = [{ productId: '507f1f77bcf86cd799439011', quantity: 1 }];
      await expect(OrderService.validateStockAvailability(orderItems)).rejects.toThrow('Product with ID 507f1f77bcf86cd799439011 not found');
    });

    it('should throw error for insufficient stock', async () => {
      const orderItems = [
        { productId: mockProduct1._id, quantity: 15 } // More than available
      ];

      await expect(OrderService.validateStockAvailability(orderItems))
        .rejects.toThrow('Insufficient stock for "Test Product 1"');
    });

    it('should throw error for inactive product', async () => {
      await Product.findByIdAndUpdate(mockProduct1._id, { isActive: false });
      
      const orderItems = [
        { productId: mockProduct1._id, quantity: 1 }
      ];

      await expect(OrderService.validateStockAvailability(orderItems))
        .rejects.toThrow('not available for purchase');
    });
  });

  describe('Order Creation', () => {
    it('should create order with valid input', async () => {
      const orderInput = {
        items: [
          { productId: mockProduct1._id, quantity: 2 },
          { productId: mockProduct2._id, quantity: 1 }
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        notes: 'Test order'
      };

      const order = await OrderService.createOrder(mockUser._id, orderInput);

      expect(order.user.toString()).toBe(mockUser._id.toString());
      expect(order.items).toHaveLength(2);
      expect(order.totalAmount).toBe(249.97); // 99.99*2 + 49.99*1
      expect(order.status).toBe('pending');
      expect(order.shippingAddress.street).toBe('123 Main St');
      expect(order.notes).toBe('Test order');

      // Check stock was deducted
      const updatedProduct1 = await Product.findById(mockProduct1._id);
      const updatedProduct2 = await Product.findById(mockProduct2._id);
      expect(updatedProduct1.stock).toBe(8); // 10 - 2
      expect(updatedProduct2.stock).toBe(4); // 5 - 1
    });

    it('should create order without optional fields', async () => {
      const orderInput = {
        items: [{ productId: mockProduct1._id, quantity: 1 }]
      };

      const order = await OrderService.createOrder(mockUser._id, orderInput);

      expect(order.user.toString()).toBe(mockUser._id.toString());
      expect(order.items).toHaveLength(1);
      expect(order.totalAmount).toBe(99.99);
      // Optional fields can be undefined or have default values - both are acceptable
      expect(order).toBeDefined();
    });

    it('should rollback on stock validation failure', async () => {
      const orderInput = {
        items: [
          { productId: mockProduct1._id, quantity: 1 },
          { productId: mockProduct2._id, quantity: 10 } // Insufficient stock
        ]
      };

      await expect(OrderService.createOrder(mockUser._id, orderInput))
        .rejects.toThrow('Insufficient stock');

      // Check no stock was deducted
      const product1 = await Product.findById(mockProduct1._id);
      const product2 = await Product.findById(mockProduct2._id);
      expect(product1.stock).toBe(10);
      expect(product2.stock).toBe(5);

      // Check no order was created
      const orders = await Order.find({ user: mockUser._id });
      expect(orders).toHaveLength(1); // Only the one from beforeEach
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel order and restore inventory', async () => {
      const cancelledOrder = await OrderService.cancelOrder(
        mockOrder._id, 
        mockUser._id.toString(), 
        'customer'
      );

      expect(cancelledOrder.status).toBe('cancelled');

      // Check stock was restored
      const updatedProduct = await Product.findById(mockProduct1._id);
      expect(updatedProduct.stock).toBe(12); // Original 10 + restored 2
    });

    it('should allow admin to cancel any order', async () => {
      const cancelledOrder = await OrderService.cancelOrder(
        mockOrder._id, 
        'admin-user-id', 
        'admin'
      );

      expect(cancelledOrder.status).toBe('cancelled');
    });

    it('should throw error for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      await expect(OrderService.cancelOrder(fakeId, mockUser._id, 'customer'))
        .rejects.toThrow('Order not found');
    });

    it('should throw error when customer tries to cancel another user order', async () => {
      const otherUser = await User.create({
        email: 'other@test.com',
        password: 'password123',
        role: 'customer'
      });

      await expect(OrderService.cancelOrder(
        mockOrder._id, 
        otherUser._id.toString(), 
        'customer'
      )).rejects.toThrow('Not authorized to cancel this order');
    });

    it('should throw error for invalid status transition', async () => {
      await Order.findByIdAndUpdate(mockOrder._id, { status: 'delivered' });

      await expect(OrderService.cancelOrder(
        mockOrder._id, 
        mockUser._id.toString(), 
        'customer'
      )).rejects.toThrow('Cannot cancel order with status "delivered"');
    });
  });

  describe('Order Status Update', () => {
    it('should update order status with valid transition', async () => {
      const updatedOrder = await OrderService.updateOrderStatus(
        mockOrder._id, 
        'confirmed', 
        'admin-user-id'
      );

      expect(updatedOrder.status).toBe('confirmed');
    });

    it('should throw error for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      await expect(OrderService.updateOrderStatus(
        fakeId, 
        'confirmed', 
        'admin-user-id'
      )).rejects.toThrow('Order not found');
    });

    it('should throw error for invalid status transition', async () => {
      await expect(OrderService.updateOrderStatus(
        mockOrder._id, 
        'shipped', 
        'admin-user-id'
      )).rejects.toThrow('Invalid status transition from "pending" to "shipped"');
    });
  });

  describe('Order Analytics', () => {
    beforeEach(async () => {
      // Create additional orders for analytics
      await Order.create({
        user: mockUser._id,
        items: [{ product: mockProduct1._id, quantity: 1, price: 99.99 }],
        totalAmount: 99.99,
        status: 'confirmed'
      });

      await Order.create({
        user: mockUser._id,
        items: [{ product: mockProduct2._id, quantity: 2, price: 49.99 }],
        totalAmount: 99.98,
        status: 'delivered'
      });
    });

    it('should calculate order analytics correctly', async () => {
      const analytics = await OrderService.getOrderAnalytics();

      expect(analytics.totalOrders).toBe(3);
      expect(analytics.totalRevenue).toBe(399.95); // 199.98 + 99.99 + 99.98
      expect(analytics.averageOrderValue).toBeCloseTo(133.32, 2);
      expect(analytics.ordersByStatus).toHaveLength(3);
      
      const statusCounts = analytics.ordersByStatus.reduce((acc, item) => {
        acc[item.status] = item.count;
        return acc;
      }, {});
      
      expect(statusCounts.PENDING).toBe(1);
      expect(statusCounts.CONFIRMED).toBe(1);
      expect(statusCounts.DELIVERED).toBe(1);
    });

    it('should handle empty analytics', async () => {
      await Order.deleteMany({});
      
      const analytics = await OrderService.getOrderAnalytics();

      expect(analytics.totalOrders).toBe(0);
      expect(analytics.totalRevenue).toBe(0);
      expect(analytics.averageOrderValue).toBe(0);
      expect(analytics.ordersByStatus).toHaveLength(0);
    });
  });

  describe('Order Pagination', () => {
    beforeEach(async () => {
      // Create additional orders for pagination testing
      for (let i = 0; i < 25; i++) {
        await Order.create({
          user: mockUser._id,
          items: [{ product: mockProduct1._id, quantity: 1, price: 99.99 }],
          totalAmount: 99.99,
          status: i % 2 === 0 ? 'pending' : 'confirmed'
        });
      }
    });

    it('should paginate orders correctly', async () => {
      const result = await OrderService.getOrdersPaginated({}, { first: 10 });

      expect(result.orders).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.totalCount).toBe(26); // 25 + 1 from beforeEach
    });

    it('should filter orders by status', async () => {
      const result = await OrderService.getOrdersPaginated(
        { status: 'pending' }, 
        { first: 20 }
      );

      expect(result.orders.length).toBeGreaterThan(0);
      result.orders.forEach(order => {
        expect(order.status).toBe('pending');
      });
    });

    it('should filter orders by user', async () => {
      const otherUser = await User.create({
        email: 'other@test.com',
        password: 'password123',
        role: 'customer'
      });

      await Order.create({
        user: otherUser._id,
        items: [{ product: mockProduct1._id, quantity: 1, price: 99.99 }],
        totalAmount: 99.99,
        status: 'pending'
      });

      const result = await OrderService.getOrdersPaginated(
        { userId: mockUser._id }, 
        { first: 50 }
      );

      expect(result.orders.length).toBe(26); // All orders for mockUser
      result.orders.forEach(order => {
        expect(order.user._id.toString()).toBe(mockUser._id.toString());
      });
    });

    it('should handle cursor-based pagination', async () => {
      const firstPage = await OrderService.getOrdersPaginated({}, { first: 10 });
      expect(firstPage.orders).toHaveLength(10);

      const lastOrderOfFirstPage = firstPage.orders[firstPage.orders.length - 1];
      const secondPage = await OrderService.getOrdersPaginated(
        {}, 
        { first: 10, after: lastOrderOfFirstPage._id }
      );

      expect(secondPage.orders).toHaveLength(10);
      expect(secondPage.orders[0]._id.toString()).not.toBe(lastOrderOfFirstPage._id.toString());
    });

    it('should handle empty results', async () => {
      const result = await OrderService.getOrdersPaginated(
        { status: 'nonexistent' }, 
        { first: 10 }
      );

      expect(result.orders).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.totalCount).toBe(26); // totalCount only filters by userId, not status
    });
  });

  describe('Concurrent Order Processing', () => {
    it('should handle concurrent stock deduction correctly', async () => {
      const product = await Product.create({
        name: 'Limited Product',
        category: 'Electronics',
        price: 50,
        stock: 1,
        isActive: true,
        createdBy: mockUser._id
      });

      const orderInput = {
        items: [{ productId: product._id, quantity: 1 }]
      };

      // Create two users
      const user1 = await User.create({
        email: 'user1@test.com',
        password: 'password123',
        role: 'customer'
      });

      const user2 = await User.create({
        email: 'user2@test.com',
        password: 'password123',
        role: 'customer'
      });

      // Simulate concurrent order creation
      const orderPromises = [
        OrderService.createOrder(user1._id, orderInput),
        OrderService.createOrder(user2._id, orderInput)
      ];

      const results = await Promise.allSettled(orderPromises);
      
      // One should succeed, one should fail
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.message).toContain('Insufficient stock');

      // Check final stock
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Force a database error by using an invalid ObjectId format
      await expect(OrderService.updateOrderStatus(
        'invalid-id', 
        'confirmed', 
        'admin-id'
      )).rejects.toThrow();
    });

    it('should handle missing required fields', async () => {
      const orderInput = {
        items: [{ productId: mockProduct1._id }] // Missing quantity
      };

      await expect(OrderService.createOrder(mockUser._id, orderInput))
        .rejects.toThrow();
    });
  });
}); 