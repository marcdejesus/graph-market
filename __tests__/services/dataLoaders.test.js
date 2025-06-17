import { createDataLoaders } from '../../src/services/dataLoaders.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { ensureTestDBConnection, clearTestCollections, closeTestDBConnection } from '../utils/testDB.js';
import { cache } from '../../src/config/redis.js';

describe('DataLoader Services', () => {
  let testUsers = [];
  let testProducts = [];
  let testOrders = [];
  
  beforeAll(async () => {
    await ensureTestDBConnection();
  });

  afterAll(async () => {
    await closeTestDBConnection();
  });
  
  beforeEach(async () => {
    await clearTestCollections();
    
    // Create test users
    testUsers = await User.create([
      {
        email: 'user1@test.com',
        password: 'password123',
        firstName: 'User',
        lastName: 'One',
        role: 'customer',
      },
      {
        email: 'user2@test.com',
        password: 'password123',
        firstName: 'User',
        lastName: 'Two',
        role: 'admin',
      },
    ]);
    
    // Create test products
    testProducts = await Product.create([
      {
        name: 'Test Product 1',
        description: 'Test description 1',
        price: 10.99,
        category: 'electronics',
        stock: 100,
        sku: 'TEST001',
        imageUrl: 'http://example.com/image1.jpg',
        createdBy: testUsers[1]._id,
      },
      {
        name: 'Test Product 2',
        description: 'Test description 2',
        price: 25.99,
        category: 'books',
        stock: 50,
        sku: 'TEST002',
        imageUrl: 'http://example.com/image2.jpg',
        createdBy: testUsers[1]._id,
      },
    ]);
    
    // Create test orders
    testOrders = await Order.create([
      {
        user: testUsers[0]._id,
        items: [
          {
            product: testProducts[0]._id,
            quantity: 2,
            price: testProducts[0].price,
          },
        ],
        totalAmount: testProducts[0].price * 2,
        status: 'pending',
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'Test Country',
        },
      },
    ]);
  });
  
  describe('UserLoader', () => {
    test('should batch load multiple users', async () => {
      const dataLoaders = createDataLoaders();
      
      // Request multiple users concurrently
      const userPromises = [
        dataLoaders.userLoader.load(testUsers[0]._id.toString()),
        dataLoaders.userLoader.load(testUsers[1]._id.toString()),
      ];
      
      const results = await Promise.all(userPromises);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        _id: testUsers[0]._id,
        email: testUsers[0].email,
        firstName: testUsers[0].firstName,
      });
      expect(results[1]).toMatchObject({
        _id: testUsers[1]._id,
        email: testUsers[1].email,
        firstName: testUsers[1].firstName,
      });
      
      // Should not include password
      expect(results[0].password).toBeUndefined();
      expect(results[1].password).toBeUndefined();
    });
    
    test('should handle non-existent user IDs', async () => {
      const dataLoaders = createDataLoaders();
      const nonExistentId = '507f1f77bcf86cd799439011';
      
      const result = await dataLoaders.userLoader.load(nonExistentId);
      
      expect(result).toBeNull();
    });
    
    test('should cache user results', async () => {
      const dataLoaders = createDataLoaders();
      const userId = testUsers[0]._id.toString();
      
      // First load
      const user1 = await dataLoaders.userLoader.load(userId);
      
      // Second load should come from cache
      const user2 = await dataLoaders.userLoader.load(userId);
      
      expect(user1).toEqual(user2);
    });
  });
  
  describe('ProductLoader', () => {
    test('should batch load multiple products', async () => {
      const dataLoaders = createDataLoaders();
      
      const productPromises = [
        dataLoaders.productLoader.load(testProducts[0]._id.toString()),
        dataLoaders.productLoader.load(testProducts[1]._id.toString()),
      ];
      
      const results = await Promise.all(productPromises);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        _id: testProducts[0]._id,
        name: testProducts[0].name,
        price: testProducts[0].price,
      });
      expect(results[1]).toMatchObject({
        _id: testProducts[1]._id,
        name: testProducts[1].name,
        price: testProducts[1].price,
      });
    });
    
    test('should include populated creator data', async () => {
      const dataLoaders = createDataLoaders();
      
      const product = await dataLoaders.productLoader.load(testProducts[0]._id.toString());
      
      expect(product.createdBy).toMatchObject({
        _id: testUsers[1]._id,
        firstName: testUsers[1].firstName,
        lastName: testUsers[1].lastName,
        email: testUsers[1].email,
      });
    });
    
    test('should handle non-existent product IDs', async () => {
      const dataLoaders = createDataLoaders();
      const nonExistentId = '507f1f77bcf86cd799439011';
      
      const result = await dataLoaders.productLoader.load(nonExistentId);
      
      expect(result).toBeNull();
    });
  });
  
  describe('UserOrdersLoader', () => {
    test('should batch load orders for multiple users', async () => {
      const dataLoaders = createDataLoaders();
      
      const orderPromises = [
        dataLoaders.userOrdersLoader.load(testUsers[0]._id.toString()),
        dataLoaders.userOrdersLoader.load(testUsers[1]._id.toString()),
      ];
      
      const results = await Promise.all(orderPromises);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(1); // User 0 has 1 order
      expect(results[1]).toHaveLength(0); // User 1 has no orders
      
      const userOrder = results[0][0];
      expect(userOrder).toMatchObject({
        _id: testOrders[0]._id,
        user: testUsers[0]._id,
        totalAmount: testOrders[0].totalAmount,
      });
    });
    
    test('should include populated product data in order items', async () => {
      const dataLoaders = createDataLoaders();
      
      const orders = await dataLoaders.userOrdersLoader.load(testUsers[0]._id.toString());
      
      expect(orders[0].items[0].product).toMatchObject({
        _id: testProducts[0]._id,
        name: testProducts[0].name,
        price: testProducts[0].price,
      });
    });
    
    test('should return empty array for users with no orders', async () => {
      const dataLoaders = createDataLoaders();
      
      const orders = await dataLoaders.userOrdersLoader.load(testUsers[1]._id.toString());
      
      expect(orders).toEqual([]);
    });
  });
  
  describe('ProductCreatorLoader', () => {
    test('should batch load creators for multiple products', async () => {
      const dataLoaders = createDataLoaders();
      
      const creatorPromises = [
        dataLoaders.productCreatorLoader.load(testProducts[0]._id.toString()),
        dataLoaders.productCreatorLoader.load(testProducts[1]._id.toString()),
      ];
      
      const results = await Promise.all(creatorPromises);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        _id: testUsers[1]._id,
        firstName: testUsers[1].firstName,
        lastName: testUsers[1].lastName,
        role: testUsers[1].role,
      });
      expect(results[1]).toMatchObject({
        _id: testUsers[1]._id,
        firstName: testUsers[1].firstName,
        lastName: testUsers[1].lastName,
        role: testUsers[1].role,
      });
    });
    
    test('should handle non-existent product IDs', async () => {
      const dataLoaders = createDataLoaders();
      const nonExistentId = '507f1f77bcf86cd799439011';
      
      const result = await dataLoaders.productCreatorLoader.load(nonExistentId);
      
      expect(result).toBeNull();
    });
  });
  
  describe('OrderItemsLoader', () => {
    test('should batch load items for multiple orders', async () => {
      const dataLoaders = createDataLoaders();
      
      const itemsPromises = [
        dataLoaders.orderItemsLoader.load(testOrders[0]._id.toString()),
      ];
      
      const results = await Promise.all(itemsPromises);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveLength(1); // Order has 1 item
      
      const orderItem = results[0][0];
      expect(orderItem).toMatchObject({
        product: expect.objectContaining({
          _id: testProducts[0]._id,
          name: testProducts[0].name,
        }),
        quantity: 2,
        price: testProducts[0].price,
      });
    });
    
    test('should return empty array for non-existent orders', async () => {
      const dataLoaders = createDataLoaders();
      const nonExistentId = '507f1f77bcf86cd799439011';
      
      const result = await dataLoaders.orderItemsLoader.load(nonExistentId);
      
      expect(result).toEqual([]);
    });
  });
  
  describe('DataLoader Utilities', () => {
    test('should provide statistics', () => {
      const dataLoaders = createDataLoaders();
      
      const stats = dataLoaders.getStats();
      
      expect(stats).toMatchObject({
        userLoader: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
        productLoader: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
        userOrdersLoader: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
        productCreatorLoader: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
        orderItemsLoader: expect.objectContaining({
          cacheSize: expect.any(Number),
        }),
      });
    });
    
    test('should clear all loaders', async () => {
      const dataLoaders = createDataLoaders();
      
      // Load some data first
      await dataLoaders.userLoader.load(testUsers[0]._id.toString());
      await dataLoaders.productLoader.load(testProducts[0]._id.toString());
      
      // Clear all loaders
      dataLoaders.clearAll();
      
      const stats = dataLoaders.getStats();
      
      // All cache sizes should be 0 after clearing
      Object.values(stats).forEach(loaderStats => {
        expect(loaderStats.cacheSize).toBe(0);
      });
    });
    
    test('should prime loader with data', async () => {
      const dataLoaders = createDataLoaders();
      const testUser = testUsers[0];
      
      // Prime the loader
      dataLoaders.prime('user', testUser._id.toString(), testUser);
      
      // Load should return the primed data without hitting the database
      const result = await dataLoaders.userLoader.load(testUser._id.toString());
      
      expect(result).toEqual(testUser);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      const dataLoaders = createDataLoaders();
      
      // Mock a database error
      const originalFind = User.find;
      User.find = jest.fn().mockRejectedValue(new Error('Database connection error'));
      
      const result = await dataLoaders.userLoader.load(testUsers[0]._id.toString());
      
      expect(result).toBeNull();
      
      // Restore original method
      User.find = originalFind;
    });
    
    test('should handle cache errors gracefully', async () => {
      const dataLoaders = createDataLoaders();
      
      // Mock cache error
      const originalMget = cache.mget;
      cache.mget = jest.fn().mockRejectedValue(new Error('Cache error'));
      
      // Should still work by falling back to database
      const result = await dataLoaders.userLoader.load(testUsers[0]._id.toString());
      
      expect(result).toMatchObject({
        _id: testUsers[0]._id,
        email: testUsers[0].email,
      });
      
      // Restore original method
      cache.mget = originalMget;
    });
  });
  
  describe('Performance Optimization', () => {
    test('should deduplicate identical requests', async () => {
      const dataLoaders = createDataLoaders();
      const userId = testUsers[0]._id.toString();
      
      // Make multiple requests for the same user simultaneously
      const promises = [
        dataLoaders.userLoader.load(userId),
        dataLoaders.userLoader.load(userId),
        dataLoaders.userLoader.load(userId),
      ];
      
      const results = await Promise.all(promises);
      
      // All results should be identical (same object reference due to caching)
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });
    
    test('should batch requests within the same event loop tick', async () => {
      const dataLoaders = createDataLoaders();
      
      // Mock User.find to track how many times it's called
      const originalFind = User.find;
      const findSpy = jest.fn().mockImplementation(originalFind.bind(User));
      User.find = findSpy;
      
      // Make requests for different users in the same tick
      const promises = [
        dataLoaders.userLoader.load(testUsers[0]._id.toString()),
        dataLoaders.userLoader.load(testUsers[1]._id.toString()),
      ];
      
      await Promise.all(promises);
      
      // Should only make one database call due to batching
      expect(findSpy).toHaveBeenCalledTimes(1);
      
      // Restore original method
      User.find = originalFind;
    });
  });
}); 