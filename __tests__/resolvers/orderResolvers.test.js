import { GraphQLError } from 'graphql';
import mongoose from 'mongoose';
import { Order } from '../../src/models/Order.js';
import { Product } from '../../src/models/Product.js';
import { User } from '../../src/models/User.js';
import { orderResolvers } from '../../src/resolvers/orderResolvers.js';
import { OrderService } from '../../src/services/orderService.js';
import { generateToken } from '../../src/utils/auth.js';
import { ensureTestDBConnection, clearTestCollections, closeTestDBConnection } from '../utils/testDB.js';

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

describe('Order Resolvers', () => {
  let mockUser, mockAdmin, mockProduct, mockOrder;
  let userToken, adminToken;

  const createContext = (user) => ({
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isCustomer: user?.role === 'customer',
  });

  beforeEach(async () => {
    await clearTestCollections();

    mockUser = await User.create({
      email: 'customer@test.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
      role: 'customer',
    });

    mockAdmin = await User.create({
      email: 'admin@test.com',
      password: 'password123',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
    });

    mockProduct = await Product.create({
      name: 'Test Product',
      description: 'A test product',
      category: 'Electronics',
      price: 99.99,
      stock: 10,
      isActive: true,
      createdBy: mockAdmin._id,
    });

    userToken = generateToken(mockUser._id, mockUser.role);
    adminToken = generateToken(mockAdmin._id, mockAdmin.role);

    mockOrder = await Order.create({
      user: mockUser._id,
      items: [
        {
          product: mockProduct._id,
          quantity: 2,
          price: mockProduct.price,
        },
      ],
      totalAmount: 199.98,
      status: 'pending',
    });
  });

  describe('Query: myOrders', () => {
    it('should return user orders when authenticated', async () => {
      const context = createContext(mockUser);
      const result = await orderResolvers.Query.myOrders({}, {}, context);
      expect(result).toHaveLength(1);
      expect(result[0]._id.toString()).toBe(mockOrder._id.toString());
    });

    it('should throw error when not authenticated', async () => {
      const context = createContext(null);
      await expect(orderResolvers.Query.myOrders({}, {}, context)).rejects.toThrow('Authentication required');
    });

    it('should return empty array when user has no orders', async () => {
      await Order.deleteMany({});
      const context = createContext(mockUser);
      const result = await orderResolvers.Query.myOrders({}, {}, context);
      expect(result).toHaveLength(0);
    });
  });

  describe('Query: order', () => {
    it('should return order for owner', async () => {
      const context = { token: userToken };
      const result = await orderResolvers.Query.order({}, { id: mockOrder._id }, context);
      expect(result._id.toString()).toBe(mockOrder._id.toString());
    });

    it('should return order for admin', async () => {
      const context = { token: adminToken };
      const result = await orderResolvers.Query.order({}, { id: mockOrder._id }, context);
      expect(result._id.toString()).toBe(mockOrder._id.toString());
    });

    it('should throw error when user tries to access another user order', async () => {
      const otherUser = await User.create({ email: 'other@test.com', password: 'password123', role: 'customer' });
      const otherToken = generateToken(otherUser._id, otherUser.role);
      const context = { token: otherToken };
      await expect(orderResolvers.Query.order({}, { id: mockOrder._id }, context)).rejects.toThrow('Not authorized to view this order');
    });

    it('should throw error for non-existent order', async () => {
      const context = { token: userToken };
      const fakeId = '507f1f77bcf86cd799439011';
      await expect(orderResolvers.Query.order({}, { id: fakeId }, context)).rejects.toThrow('Order not found');
    });
  });

  describe('Query: allOrders', () => {
    it('should return all orders for admin', async () => {
        const context = { token: adminToken };
        const result = await orderResolvers.Query.allOrders({}, {}, context);
        expect(result).toHaveLength(1);
    });
  });

  describe('Query: orderStats', () => {
    it('should return order analytics for admin', async () => {
      const context = { token: adminToken };
      const result = await orderResolvers.Query.orderStats({}, {}, context);

      expect(result).toHaveProperty('totalOrders');
      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('averageOrderValue');
      expect(result).toHaveProperty('ordersByStatus');
      expect(result.totalOrders).toBe(1);
      expect(result.totalRevenue).toBe(199.98);
    });

    it('should throw error for non-admin users', async () => {
      const context = { token: userToken };

      await expect(orderResolvers.Query.orderStats({}, {}, context))
        .rejects.toThrow('Admin access required');
    });
  });

  describe('Mutation: placeOrder', () => {
    it('should create order with valid input', async () => {
      const input = {
        items: [{ productId: mockProduct._id, quantity: 2 }],
        shippingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        }
      };
      const context = createContext(mockUser);

      const result = await orderResolvers.Mutation.placeOrder({}, { input }, context);

      expect(result.totalAmount).toBe(199.98);
      expect(result.items).toHaveLength(1);
      expect(result.status).toBe('PENDING');

      // Check stock was deducted
      const updatedProduct = await Product.findById(mockProduct._id);
      expect(updatedProduct.stock).toBe(8);
    });

    it('should throw error for insufficient stock', async () => {
      const input = {
        items: [{ productId: mockProduct._id, quantity: 20 }] // More than available stock
      };
      const context = createContext(mockUser);

      await expect(orderResolvers.Mutation.placeOrder({}, { input }, context))
        .rejects.toThrow('Insufficient stock');
    });

    it('should throw error for non-existent product', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const input = {
        items: [{ productId: fakeId, quantity: 1 }]
      };
      const context = createContext(mockUser);

      await expect(orderResolvers.Mutation.placeOrder({}, { input }, context))
        .rejects.toThrow('Product with ID');
    });

    it('should throw error for inactive product', async () => {
      await Product.findByIdAndUpdate(mockProduct._id, { isActive: false });
      
      const input = {
        items: [{ productId: mockProduct._id, quantity: 1 }]
      };
      const context = createContext(mockUser);

      await expect(orderResolvers.Mutation.placeOrder({}, { input }, context))
        .rejects.toThrow('not available for purchase');
    });

    it('should throw error for empty order', async () => {
      const input = { items: [] };
      const context = createContext(mockUser);

      await expect(orderResolvers.Mutation.placeOrder({}, { input }, context))
        .rejects.toThrow('Order must contain at least one item');
    });

    it('should throw error when not authenticated', async () => {
      const input = {
        items: [{ productId: 'some-id', quantity: 1 }]
      };
      const context = {};

      await expect(orderResolvers.Mutation.placeOrder({}, { input }, context))
        .rejects.toThrow('Authentication required');
    });
  });

  describe('Mutation: cancelOrder', () => {
    it('should cancel order by owner', async () => {
      const context = createContext(mockUser);
      const result = await orderResolvers.Mutation.cancelOrder(
        {}, 
        { orderId: mockOrder._id }, 
        context
      );

      expect(result.status).toBe('CANCELLED');

      // Check stock was restored
      const updatedProduct = await Product.findById(mockProduct._id);
      expect(updatedProduct.stock).toBe(12); // Original 10 + restored 2
    });

    it('should cancel order by admin', async () => {
      const context = createContext(mockAdmin);
      const result = await orderResolvers.Mutation.cancelOrder(
        {}, 
        { orderId: mockOrder._id }, 
        context
      );

      expect(result.status).toBe('CANCELLED');
    });

    it('should throw error when user tries to cancel another user order', async () => {
      const otherUser = await User.create({
        email: 'other@test.com',
        password: 'password123',
        role: 'customer'
      });
      const otherToken = generateToken(otherUser._id, otherUser.role);
      const context = createContext(otherUser);

      await expect(orderResolvers.Mutation.cancelOrder(
        {}, 
        { orderId: mockOrder._id }, 
        context
      )).rejects.toThrow('Not authorized to cancel this order');
    });

    it('should throw error for non-existent order', async () => {
      const context = createContext(mockUser);
      const fakeId = '507f1f77bcf86cd799439011';

      await expect(orderResolvers.Mutation.cancelOrder(
        {}, 
        { orderId: fakeId }, 
        context
      )).rejects.toThrow('Order not found');
    });

    it('should throw error for already delivered order', async () => {
      await Order.findByIdAndUpdate(mockOrder._id, { status: 'delivered' });
      const context = { token: userToken };

      await expect(orderResolvers.Mutation.cancelOrder(
        {}, 
        { orderId: mockOrder._id }, 
        context
      )).rejects.toThrow('Cannot cancel order with status "delivered"');
    });
  });

  describe('Mutation: updateOrderStatus', () => {
    it('should update order status by admin', async () => {
      const context = createContext(mockAdmin);
      const result = await orderResolvers.Mutation.updateOrderStatus(
        {}, 
        { orderId: mockOrder._id, status: 'CONFIRMED' }, 
        context
      );

      expect(result.status).toBe('CONFIRMED');
    });

    it('should throw error for invalid status transition', async () => {
      await Order.findByIdAndUpdate(mockOrder._id, { status: 'delivered' });
      const context = { token: adminToken };

      await expect(orderResolvers.Mutation.updateOrderStatus(
        {}, 
        { orderId: mockOrder._id, status: 'PENDING' }, 
        context
      )).rejects.toThrow('Invalid status transition');
    });

    it('should throw error for non-admin users', async () => {
      const context = createContext(mockUser);

      await expect(orderResolvers.Mutation.updateOrderStatus(
        {}, 
        { orderId: 'some-id', status: 'CONFIRMED' }, 
        context
      )).rejects.toThrow('Admin access required');
    });

    it('should throw error for non-existent order', async () => {
      const context = { token: adminToken };
      const fakeId = '507f1f77bcf86cd799439011';

      await expect(orderResolvers.Mutation.updateOrderStatus(
        {}, 
        { orderId: fakeId, status: 'CONFIRMED' }, 
        context
      )).rejects.toThrow('Order not found');
    });
  });

  describe('Field Resolvers', () => {
    describe('Order.user', () => {
      it('should return populated user', async () => {
        const order = await Order.findById(mockOrder._id).populate('user');
        const result = await orderResolvers.Order.user(order);

        expect(result.email).toBe('customer@test.com');
        expect(result.firstName).toBe('John');
      });

      it('should populate user when not already populated', async () => {
        const order = await Order.findById(mockOrder._id);
        const result = await orderResolvers.Order.user(order);

        expect(result.email).toBe('customer@test.com');
      });
    });

    describe('Order.items', () => {
      it('should return populated items', async () => {
        const order = await Order.findById(mockOrder._id).populate('items.product');
        const result = await orderResolvers.Order.items(order);

        expect(result).toHaveLength(1);
        expect(result[0].product.name).toBe('Test Product');
      });
    });

    describe('Order.orderNumber', () => {
      it('should generate order number', () => {
        const mockOrderData = { _id: { toString: () => 'abcdef1234567890' } };
        const result = orderResolvers.Order.orderNumber(mockOrderData);
        expect(result).toMatch(/^ORD-[A-Z0-9]{8}$/);
      });
    });

    describe('Order.status', () => {
      it('should convert status to uppercase', () => {
        const mockOrderData = { status: 'pending' };
        const result = orderResolvers.Order.status(mockOrderData);
        expect(result).toBe('PENDING');
      });
    });

    describe('OrderItem.product', () => {
      it('should return populated product', async () => {
        const orderItem = {
          product: mockProduct,
          quantity: 2,
          price: 99.99
        };
        const result = await orderResolvers.OrderItem.product(orderItem);

        expect(result.name).toBe('Test Product');
      });
    });
  });

  describe('Order Status State Machine', () => {
    it('should allow valid transitions', () => {
      expect(OrderService.isValidStatusTransition('pending', 'confirmed')).toBe(true);
      expect(OrderService.isValidStatusTransition('confirmed', 'processing')).toBe(true);
      expect(OrderService.isValidStatusTransition('processing', 'shipped')).toBe(true);
      expect(OrderService.isValidStatusTransition('shipped', 'delivered')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(OrderService.isValidStatusTransition('pending', 'shipped')).toBe(false);
      expect(OrderService.isValidStatusTransition('delivered', 'pending')).toBe(false);
      expect(OrderService.isValidStatusTransition('cancelled', 'confirmed')).toBe(false);
    });

    it('should allow cancellation from valid states', () => {
      expect(OrderService.isValidStatusTransition('pending', 'cancelled')).toBe(true);
      expect(OrderService.isValidStatusTransition('confirmed', 'cancelled')).toBe(true);
      expect(OrderService.isValidStatusTransition('processing', 'cancelled')).toBe(true);
    });

    it('should not allow cancellation from final states', () => {
      expect(OrderService.isValidStatusTransition('delivered', 'cancelled')).toBe(false);
      expect(OrderService.isValidStatusTransition('cancelled', 'cancelled')).toBe(false);
    });
  });

  describe('Stock Management', () => {
    it('should handle concurrent order creation correctly', async () => {
      const product = await Product.create({
        name: 'Limited Product',
        category: 'Electronics',
        price: 50,
        stock: 1,
        isActive: true,
        createdBy: mockAdmin._id
      });

      const orderInput = {
        items: [{ productId: product._id, quantity: 1 }]
      };

      // Simulate concurrent order creation
      const orderPromises = [
        OrderService.createOrder(mockUser._id, orderInput),
        OrderService.createOrder(mockAdmin._id, orderInput)
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
}); 