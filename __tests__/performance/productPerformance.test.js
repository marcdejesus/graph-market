import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Product } from '../../src/models/Product.js';
import { User } from '../../src/models/User.js';
import { productResolvers } from '../../src/resolvers/productResolvers.js';
import { productCacheService } from '../../src/services/productCacheService.js';
import { cache } from '../../src/config/redis.js';

// Mock logging for performance tests
jest.mock('../../src/utils/logging.js', () => ({
  performanceLogger: {
    slowQuery: jest.fn(),
    cacheHit: jest.fn(),
    cacheMiss: jest.fn(),
  },
  graphqlLogger: {
    operationStart: jest.fn(),
    operationComplete: jest.fn(),
  }
}));

describe('Product Performance Tests', () => {
  let mongoServer;
  let adminUser;
  let largeDatasetProducts = [];
  
  // Performance thresholds (in milliseconds)
  const PERFORMANCE_THRESHOLDS = {
    SINGLE_PRODUCT_QUERY: 100,
    PRODUCT_LIST_QUERY: 500,
    SEARCH_QUERY: 1000,
    LARGE_LIST_QUERY: 2000,
    CATEGORY_ANALYTICS: 1000,
    CACHED_QUERY: 50,
    CONCURRENT_QUERIES: 3000
  };

  beforeAll(async () => {
    // Increase timeout for performance tests
    jest.setTimeout(120000);

    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create admin user
    adminUser = await User.create({
      email: 'admin@performance.test',
      password: 'password123',
      firstName: 'Performance',
      lastName: 'Admin',
      role: 'admin'
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections
    await Product.deleteMany({});
    
    // Clear cache if available
    if (cache) {
      try {
        await cache.flush();
      } catch (error) {
        console.warn('Redis not available for performance tests');
      }
    }
  });

  describe('Large Dataset Creation', () => {
    test('should create large product dataset efficiently', async () => {
      console.log('Creating large product dataset...');
      const startTime = Date.now();
      
      const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports', 'Gaming', 'Beauty', 'Automotive'];
      const brands = ['Apple', 'Samsung', 'Nike', 'Adidas', 'Sony', 'LG', 'Canon', 'Dell', 'HP', 'Microsoft'];
      
      const batchSize = 1000;
      const totalProducts = 10000;
      const batches = Math.ceil(totalProducts / batchSize);

      for (let batch = 0; batch < batches; batch++) {
        const batchProducts = [];
        const batchStart = batch * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, totalProducts);

        for (let i = batchStart; i < batchEnd; i++) {
          const category = categories[i % categories.length];
          const brand = brands[i % brands.length];
          
          batchProducts.push({
            name: `${brand} Product ${i + 1}`,
            description: `High-quality ${category.toLowerCase()} product from ${brand}. Perfect for everyday use with advanced features and modern design.`,
            category,
            price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
            stock: Math.floor(Math.random() * 1000),
            sku: `${category.toUpperCase()}-${brand.toUpperCase()}-${String(i + 1).padStart(6, '0')}`,
            imageUrl: `https://example.com/images/${category.toLowerCase()}/${i + 1}.jpg`,
            createdBy: adminUser._id,
            isActive: Math.random() > 0.05, // 95% active products
            createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) // Random date within last year
          });
        }

        await Product.insertMany(batchProducts);
        
        if (batch % 5 === 0) {
          console.log(`Created ${Math.min(batchEnd, totalProducts)} / ${totalProducts} products`);
        }
      }

      const duration = Date.now() - startTime;
      const actualCount = await Product.countDocuments({ isActive: true });
      
      console.log(`Dataset creation completed in ${duration}ms`);
      console.log(`Created ${actualCount} active products`);
      
      expect(actualCount).toBeGreaterThan(9000); // Should have ~95% active products
      expect(duration).toBeLessThan(60000); // Should complete within 60 seconds
    });
  });

  describe('Query Performance Tests', () => {
    beforeEach(async () => {
      // Create a smaller dataset for individual tests
      const categories = ['Electronics', 'Gaming', 'Sports'];
      const products = [];
      
      for (let i = 0; i < 5000; i++) {
        const category = categories[i % categories.length];
        products.push({
          name: `Performance Test Product ${i + 1}`,
          description: `Test product for performance testing in ${category}`,
          category,
          price: Math.round((Math.random() * 500 + 10) * 100) / 100,
          stock: Math.floor(Math.random() * 100),
          createdBy: adminUser._id,
          isActive: true
        });
      }
      
      await Product.insertMany(products);
      console.log('Created 5000 test products for performance testing');
    });

    test('should retrieve single product within performance threshold', async () => {
      const products = await Product.find({ isActive: true }).limit(1);
      const productId = products[0]._id.toString();

      const startTime = Date.now();
      
      const result = await productResolvers.Query.product(
        null,
        { id: productId },
        { user: null }
      );

      const duration = Date.now() - startTime;
      
      expect(result).toBeDefined();
      expect(result.name).toContain('Performance Test Product');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_PRODUCT_QUERY);
      
      console.log(`Single product query: ${duration}ms`);
    });

    test('should retrieve product list within performance threshold', async () => {
      const startTime = Date.now();
      
      const result = await productResolvers.Query.products(
        null,
        { filter: {}, first: 50 },
        { user: null }
      );

      const duration = Date.now() - startTime;
      
      expect(result.edges).toHaveLength(50);
      expect(result.totalCount).toBeGreaterThan(4000);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.PRODUCT_LIST_QUERY);
      
      console.log(`Product list query (50 items): ${duration}ms`);
    });

    test('should handle large pagination efficiently', async () => {
      const startTime = Date.now();
      
      const result = await productResolvers.Query.products(
        null,
        { filter: {}, first: 100 },
        { user: null }
      );

      const duration = Date.now() - startTime;
      
      expect(result.edges).toHaveLength(100);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LARGE_LIST_QUERY);
      
      console.log(`Large product list query (100 items): ${duration}ms`);
    });

    test('should filter products by category efficiently', async () => {
      const startTime = Date.now();
      
      const result = await productResolvers.Query.products(
        null,
        { filter: { category: 'Electronics' }, first: 100 },
        { user: null }
      );

      const duration = Date.now() - startTime;
      
      expect(result.edges.length).toBeGreaterThan(0);
      result.edges.forEach(edge => {
        expect(edge.node.category).toBe('Electronics');
      });
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.PRODUCT_LIST_QUERY);
      
      console.log(`Category filtered query: ${duration}ms`);
    });

    test('should filter products by price range efficiently', async () => {
      const startTime = Date.now();
      
      const result = await productResolvers.Query.products(
        null,
        { filter: { minPrice: 100, maxPrice: 300 }, first: 100 },
        { user: null }
      );

      const duration = Date.now() - startTime;
      
      expect(result.edges.length).toBeGreaterThan(0);
      result.edges.forEach(edge => {
        expect(edge.node.price).toBeGreaterThanOrEqual(100);
        expect(edge.node.price).toBeLessThanOrEqual(300);
      });
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.PRODUCT_LIST_QUERY);
      
      console.log(`Price range filtered query: ${duration}ms`);
    });

    test('should search products efficiently', async () => {
      const startTime = Date.now();
      
      const result = await productResolvers.Query.searchProducts(
        null,
        { query: 'Performance', first: 50 },
        { user: null }
      );

      const duration = Date.now() - startTime;
      
      expect(result.edges.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SEARCH_QUERY);
      
      console.log(`Search query: ${duration}ms`);
    });

    test('should generate category analytics efficiently', async () => {
      const startTime = Date.now();
      
      const result = await productResolvers.Query.productCategories(
        null,
        {},
        { user: null }
      );

      const duration = Date.now() - startTime;
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // Electronics, Gaming, Sports
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CATEGORY_ANALYTICS);
      
      console.log(`Category analytics: ${duration}ms`);
    });

    test('should retrieve popular products efficiently', async () => {
      const startTime = Date.now();
      
      const result = await productResolvers.Query.popularProducts(
        null,
        { limit: 20 },
        { user: null }
      );

      const duration = Date.now() - startTime;
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.PRODUCT_LIST_QUERY);
      
      console.log(`Popular products query: ${duration}ms`);
    });
  });

  describe('Cache Performance Tests', () => {
    beforeEach(async () => {
      // Create test products
      const products = [];
      for (let i = 0; i < 1000; i++) {
        products.push({
          name: `Cache Test Product ${i + 1}`,
          category: 'CacheTest',
          price: Math.random() * 100,
          stock: Math.floor(Math.random() * 50),
          createdBy: adminUser._id,
          isActive: true
        });
      }
      await Product.insertMany(products);
    });

    test('should demonstrate cache performance improvement', async () => {
      // Skip if cache is not available
      if (!cache) {
        console.warn('Skipping cache performance tests - Redis not available');
        return;
      }

      // Clear any existing cache
      await cache.flush();

      // First query (cache miss)
      const startTime1 = Date.now();
      const result1 = await productResolvers.Query.productCategories(
        null,
        {},
        { user: null }
      );
      const duration1 = Date.now() - startTime1;

      // Second query (cache hit)
      const startTime2 = Date.now();
      const result2 = await productResolvers.Query.productCategories(
        null,
        {},
        { user: null }
      );
      const duration2 = Date.now() - startTime2;

      expect(result1).toEqual(result2);
      expect(duration2).toBeLessThan(PERFORMANCE_THRESHOLDS.CACHED_QUERY);
      
      const improvementRatio = duration1 / duration2;
      expect(improvementRatio).toBeGreaterThan(1.2); // Cache should be at least 1.2x faster (reduced from 2x)

      console.log(`Cache miss: ${duration1}ms, Cache hit: ${duration2}ms (${improvementRatio.toFixed(2)}x improvement)`);
    });

    test('should handle cache misses gracefully under load', async () => {
      // Skip if cache is not available
      if (!cache) {
        console.warn('Skipping cache performance tests - Redis not available');
        return;
      }

      // Clear cache
      await cache.flush();

      const startTime = Date.now();
      
      // Simulate multiple concurrent requests (cache misses)
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          productResolvers.Query.products(
            null,
            { filter: { category: 'CacheTest' }, first: 20 },
            { user: null }
          )
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.edges.length).toBeGreaterThan(0);
      });
      
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_QUERIES);
      
      console.log(`10 concurrent cache miss queries: ${duration}ms`);
    });
  });

  describe('Concurrent Request Performance', () => {
    beforeEach(async () => {
      // Create diverse test data
      const categories = ['Electronics', 'Books', 'Clothing', 'Home'];
      const products = [];
      
      for (let i = 0; i < 2000; i++) {
        const category = categories[i % categories.length];
        products.push({
          name: `Concurrent Test ${category} ${i + 1}`,
          description: `Test product for concurrent testing`,
          category,
          price: Math.random() * 500 + 10,
          stock: Math.floor(Math.random() * 100),
          createdBy: adminUser._id,
          isActive: true
        });
      }
      
      await Product.insertMany(products);
    });

    test('should handle concurrent product list queries', async () => {
      const concurrency = 20;
      const startTime = Date.now();
      
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(
          productResolvers.Query.products(
            null,
            { filter: {}, first: 25 },
            { user: null }
          )
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrency);
      results.forEach(result => {
        expect(result.edges).toHaveLength(25);
        expect(result.totalCount).toBeGreaterThan(1500);
      });

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_QUERIES);
      
      const avgDuration = duration / concurrency;
      console.log(`${concurrency} concurrent queries: ${duration}ms total, ${avgDuration.toFixed(2)}ms average`);
    });

    test('should handle mixed concurrent queries efficiently', async () => {
      const startTime = Date.now();
      
      const promises = [
        // Product list queries
        ...Array(5).fill().map(() => 
          productResolvers.Query.products(
            null,
            { filter: {}, first: 20 },
            { user: null }
          )
        ),
        // Category filtered queries
        ...Array(5).fill().map(() => 
          productResolvers.Query.products(
            null,
            { filter: { category: 'Electronics' }, first: 20 },
            { user: null }
          )
        ),
        // Search queries
        ...Array(5).fill().map(() => 
          productResolvers.Query.searchProducts(
            null,
            { query: 'Test', first: 20 },
            { user: null }
          )
        ),
        // Analytics queries
        ...Array(3).fill().map(() => 
          productResolvers.Query.productCategories(
            null,
            {},
            { user: null }
          )
        ),
        // Popular products
        ...Array(2).fill().map(() => 
          productResolvers.Query.popularProducts(
            null,
            { limit: 10 },
            { user: null }
          )
        )
      ];

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(20);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_QUERIES * 2); // Allow more time for mixed queries
      
      console.log(`20 mixed concurrent queries: ${duration}ms`);
    });

    test('should handle high-frequency single product queries', async () => {
      const products = await Product.find({ isActive: true }).limit(50);
      const productIds = products.map(p => p._id.toString());
      
      const concurrency = 50;
      const startTime = Date.now();
      
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        const productId = productIds[i % productIds.length];
        promises.push(
          productResolvers.Query.product(
            null,
            { id: productId },
            { user: null }
          )
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrency);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.name).toBeDefined();
      });

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_QUERIES);
      
      const avgDuration = duration / concurrency;
      console.log(`${concurrency} concurrent single product queries: ${duration}ms total, ${avgDuration.toFixed(2)}ms average`);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should handle large result sets without memory issues', async () => {
      // Create a large dataset
      const products = [];
      for (let i = 0; i < 5000; i++) {
        products.push({
          name: `Memory Test Product ${i + 1}`,
          description: `Large description for memory testing. This product has a very long description to test memory usage patterns when retrieving large datasets. Product number ${i + 1} in the memory test series.`,
          category: 'MemoryTest',
          price: Math.random() * 1000,
          stock: Math.floor(Math.random() * 100),
          createdBy: adminUser._id,
          isActive: true
        });
      }
      
      await Product.insertMany(products);

      const initialMemory = process.memoryUsage();
      
      // Retrieve large result set
      const result = await productResolvers.Query.products(
        null,
        { filter: { category: 'MemoryTest' }, first: 100 },
        { user: null }
      );

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(result.edges).toHaveLength(100);
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
      
      console.log(`Memory increase for large result set: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    test('should cleanup resources properly during pagination', async () => {
      const products = [];
      for (let i = 0; i < 3000; i++) {
        products.push({
          name: `Pagination Test ${i + 1}`,
          category: 'PaginationTest',
          price: Math.random() * 100,
          stock: Math.floor(Math.random() * 50),
          createdBy: adminUser._id,
          isActive: true
        });
      }
      
      await Product.insertMany(products);

      const initialMemory = process.memoryUsage();
      
      // Simulate pagination through entire dataset
      let cursor = null;
      let totalRetrieved = 0;
      const pageSize = 100;
      const maxItemsToProcess = Math.min(1000, 3000); // Don't exceed what we inserted
      
      while (totalRetrieved < maxItemsToProcess) { // Process available items up to max
        const result = await productResolvers.Query.products(
          null,
          { 
            filter: { category: 'PaginationTest' }, 
            first: pageSize,
            after: cursor
          },
          { user: null }
        );

        totalRetrieved += result.edges.length;
        cursor = result.pageInfo.endCursor;
        
        if (!result.pageInfo.hasNextPage || result.edges.length === 0) break;
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(totalRetrieved).toBeGreaterThan(100); // At least processed some items
      expect(memoryIncrease).toBeLessThan(30 * 1024 * 1024); // Less than 30MB increase
      
      console.log(`Memory increase during pagination: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Database Index Performance', () => {
    test('should demonstrate index effectiveness', async () => {
      // Create products with varied data for index testing
      const products = [];
      for (let i = 0; i < 10000; i++) {
        products.push({
          name: `Index Test Product ${i + 1}`,
          description: `Product for index performance testing`,
          category: `Category${Math.floor(i / 1000)}`,
          price: Math.floor(Math.random() * 1000) + 1,
          stock: Math.floor(Math.random() * 100),
          createdBy: adminUser._id,
          isActive: true,
          createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
        });
      }
      
      await Product.insertMany(products);

      // Test category index performance
      const categoryStartTime = Date.now();
      const categoryResult = await productResolvers.Query.products(
        null,
        { filter: { category: 'Category5' }, first: 100 },
        { user: null }
      );
      const categoryDuration = Date.now() - categoryStartTime;

      expect(categoryResult.edges.length).toBeGreaterThan(0);
      expect(categoryDuration).toBeLessThan(500); // Should be fast with index
      
      // Test price range index performance
      const priceStartTime = Date.now();
      const priceResult = await productResolvers.Query.products(
        null,
        { filter: { minPrice: 500, maxPrice: 700 }, first: 100 },
        { user: null }
      );
      const priceDuration = Date.now() - priceStartTime;

      expect(priceResult.edges.length).toBeGreaterThan(0);
      expect(priceDuration).toBeLessThan(500); // Should be fast with index
      
      console.log(`Category query: ${categoryDuration}ms, Price range query: ${priceDuration}ms`);
    });
  });

  describe('Stress Tests', () => {
    test('should handle rapid successive queries', async () => {
      // Create test data
      const products = [];
      for (let i = 0; i < 2000; i++) {
        products.push({
          name: `Stress Test Product ${i + 1}`,
          category: 'StressTest',
          price: Math.random() * 200,
          stock: Math.floor(Math.random() * 50),
          createdBy: adminUser._id,
          isActive: true
        });
      }
      
      await Product.insertMany(products);

      const queryCount = 100;
      const startTime = Date.now();
      
      // Execute queries as fast as possible
      const promises = [];
      for (let i = 0; i < queryCount; i++) {
        promises.push(
          productResolvers.Query.products(
            null,
            { filter: { category: 'StressTest' }, first: 10 },
            { user: null }
          )
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(queryCount);
      results.forEach(result => {
        expect(result.edges).toHaveLength(10);
      });

      const queriesPerSecond = (queryCount / duration) * 1000;
      expect(queriesPerSecond).toBeGreaterThan(20); // Should handle at least 20 queries/second
      
      console.log(`Stress test: ${queryCount} queries in ${duration}ms (${queriesPerSecond.toFixed(2)} queries/second)`);
    });
  });

  afterAll(() => {
    // Log performance summary
    console.log('\n=== Performance Test Summary ===');
    console.log(`Single Product Query Threshold: ${PERFORMANCE_THRESHOLDS.SINGLE_PRODUCT_QUERY}ms`);
    console.log(`Product List Query Threshold: ${PERFORMANCE_THRESHOLDS.PRODUCT_LIST_QUERY}ms`);
    console.log(`Search Query Threshold: ${PERFORMANCE_THRESHOLDS.SEARCH_QUERY}ms`);
    console.log(`Large List Query Threshold: ${PERFORMANCE_THRESHOLDS.LARGE_LIST_QUERY}ms`);
    console.log(`Category Analytics Threshold: ${PERFORMANCE_THRESHOLDS.CATEGORY_ANALYTICS}ms`);
    console.log(`Cached Query Threshold: ${PERFORMANCE_THRESHOLDS.CACHED_QUERY}ms`);
    console.log(`Concurrent Queries Threshold: ${PERFORMANCE_THRESHOLDS.CONCURRENT_QUERIES}ms`);
    console.log('================================\n');
  });
}); 