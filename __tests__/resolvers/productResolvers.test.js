import mongoose from 'mongoose';
import { productResolvers } from '../../src/resolvers/productResolvers.js';

// Mock the User model before importing
jest.mock('../../src/models/User.js', () => ({
  User: {
    findById: jest.fn().mockReturnValue({
      select: jest.fn()
    }),
    create: jest.fn(),
    deleteMany: jest.fn()
  }
}));

// Mock the Product model before importing  
jest.mock('../../src/models/Product.js', () => ({
  Product: {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn()
  }
}));

import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';

// Mock all the dependencies
jest.mock('../../src/services/productCacheService.js', () => ({
  productCacheService: {
    getProductList: jest.fn(),
    setProductList: jest.fn(),
    getProduct: jest.fn(),
    setProduct: jest.fn(),
    getPopularProducts: jest.fn(),
    setPopularProducts: jest.fn(),
    getCategories: jest.fn(),
    setCategories: jest.fn(),
    getSearchResults: jest.fn(),
    setSearchResults: jest.fn(),
    invalidateProduct: jest.fn(),
    clearCache: jest.fn(),
  }
}));

// Import the mocked cache service
import { productCacheService } from '../../src/services/productCacheService.js';

jest.mock('../../src/utils/logging.js', () => ({
  performanceLogger: {
    slowQuery: jest.fn(),
    databaseQuery: jest.fn(),
    cacheHit: jest.fn(),
    cacheMiss: jest.fn(),
  },
  graphqlLogger: {
    operationStart: jest.fn(),
    operationComplete: jest.fn(),
  }
}));

describe('Product Resolvers', () => {
  let adminUser;
  let customerUser;
  let sampleProducts;

  beforeAll(async () => {
    // Create mock users for testing
    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin'
    };

    customerUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'customer@test.com',
      firstName: 'Customer',
      lastName: 'User',
      role: 'customer'
    };
  });

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create sample products
    sampleProducts = [
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'iPhone 15 Pro',
        description: 'Latest Apple smartphone with advanced features',
        category: 'Electronics',
        price: 999.99,
        stock: 50,
        createdBy: adminUser._id,
        isActive: true
      },
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'MacBook Pro M3',
        description: 'Powerful laptop for professionals',
        category: 'Electronics',
        price: 1999.99,
        stock: 25,
        createdBy: adminUser._id,
        isActive: true
      },
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Gaming Headset',
        description: 'High-quality gaming headset with surround sound',
        category: 'Gaming',
        price: 79.99,
        stock: 100,
        createdBy: adminUser._id,
        isActive: true
      },
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Out of Stock Item',
        description: 'This item is currently out of stock',
        category: 'Electronics',
        price: 299.99,
        stock: 0,
        createdBy: adminUser._id,
        isActive: true
      },
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Inactive Product',
        description: 'This product is inactive',
        category: 'Electronics',
        price: 149.99,
        stock: 10,
        createdBy: adminUser._id,
        isActive: false
      }
    ];

    // Set up default mock behaviors
    Product.find.mockReturnValue({
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      gt: jest.fn().mockResolvedValue(sampleProducts.filter(p => p.isActive))
    });
    
    // Create a mock product with save and populate methods
    const mockProduct = {
      ...sampleProducts[0],
      save: jest.fn().mockResolvedValue(sampleProducts[0]),
      populate: jest.fn().mockResolvedValue(sampleProducts[0])
    };
    
    Product.findById.mockResolvedValue(mockProduct);
    Product.create.mockImplementation(async (data) => ({
      ...data,
      _id: new mongoose.Types.ObjectId(),
      populate: jest.fn().mockResolvedValue({ ...data, createdBy: adminUser })
    }));
    Product.countDocuments.mockResolvedValue(4);

    // Setup User model mock
    const userSelectMock = jest.fn().mockResolvedValue(adminUser);
    User.findById.mockReturnValue({ select: userSelectMock });
  });

  describe('Query: products', () => {
    test('should return products without filters (cache miss)', async () => {
      // Mock cache miss
      productCacheService.getProductList.mockResolvedValue(null);
      productCacheService.setProductList.mockResolvedValue(true);

      const result = await productResolvers.Query.products(
        null,
        { filter: {}, first: 10 },
        { user: null }
      );

      expect(result.edges).toHaveLength(4); // Only active products
      expect(result.totalCount).toBe(4);
      expect(result.pageInfo.hasNextPage).toBe(false);
      
      // Verify cache was checked and set
      expect(productCacheService.getProductList).toHaveBeenCalledWith({}, { first: 10 });
      expect(productCacheService.setProductList).toHaveBeenCalled();
    });

    test('should return cached products (cache hit)', async () => {
      const cachedResult = {
        edges: [{ node: sampleProducts[0], cursor: 'cursor123' }],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
        totalCount: 1
      };

      // Mock cache hit
      productCacheService.getProductList.mockResolvedValue(cachedResult);

      const result = await productResolvers.Query.products(
        null,
        { filter: {}, first: 10 },
        { user: null }
      );

      expect(result).toEqual(cachedResult);
      
      // Verify cache was checked but not set (since it was a hit)
      expect(productCacheService.getProductList).toHaveBeenCalledWith({}, { first: 10 });
      expect(productCacheService.setProductList).not.toHaveBeenCalled();
    });

    test('should filter products by category', async () => {
      // Mock cache miss
      productCacheService.getProductList.mockResolvedValue(null);
      productCacheService.setProductList.mockResolvedValue(true);

      const result = await productResolvers.Query.products(
        null,
        { filter: { category: 'Gaming' }, first: 10 },
        { user: null }
      );

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].node.name).toBe('Gaming Headset');
      expect(result.totalCount).toBe(1);
    });

    test('should filter products by price range', async () => {
      // Mock cache miss
      productCacheService.getProductList.mockResolvedValue(null);
      productCacheService.setProductList.mockResolvedValue(true);

      const result = await productResolvers.Query.products(
        null,
        { filter: { minPrice: 500, maxPrice: 1500 }, first: 10 },
        { user: null }
      );

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].node.name).toBe('iPhone 15 Pro');
      expect(result.totalCount).toBe(1);
    });

    test('should filter products by stock status (in stock)', async () => {
      // Mock cache miss
      productCacheService.getProductList.mockResolvedValue(null);
      productCacheService.setProductList.mockResolvedValue(true);

      const result = await productResolvers.Query.products(
        null,
        { filter: { inStock: true }, first: 10 },
        { user: null }
      );

      expect(result.edges).toHaveLength(3); // Exclude out of stock item
      expect(result.totalCount).toBe(3);
    });

    test('should filter products by stock status (out of stock)', async () => {
      // Mock cache miss
      productCacheService.getProductList.mockResolvedValue(null);
      productCacheService.setProductList.mockResolvedValue(true);

      const result = await productResolvers.Query.products(
        null,
        { filter: { inStock: false }, first: 10 },
        { user: null }
      );

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].node.name).toBe('Out of Stock Item');
      expect(result.totalCount).toBe(1);
    });

    test('should handle pagination with cursor', async () => {
      // Mock cache miss
      productCacheService.getProductList.mockResolvedValue(null);
      productCacheService.setProductList.mockResolvedValue(true);

      // Get first 2 products
      const firstPage = await productResolvers.Query.products(
        null,
        { filter: {}, first: 2 },
        { user: null }
      );

      expect(firstPage.edges).toHaveLength(2);
      expect(firstPage.pageInfo.hasNextPage).toBe(true);
      expect(firstPage.pageInfo.endCursor).toBeDefined();

      // Get next page using cursor
      const cursor = firstPage.pageInfo.endCursor;
      const secondPage = await productResolvers.Query.products(
        null,
        { filter: {}, first: 2, after: cursor },
        { user: null }
      );

      expect(secondPage.edges).toHaveLength(2);
      expect(secondPage.pageInfo.hasPreviousPage).toBe(true);
    });

    test('should handle invalid cursor gracefully', async () => {
      // Mock cache miss to ensure cache errors don't interfere
      productCacheService.getProductList.mockResolvedValue(null);

      await expect(
        productResolvers.Query.products(
          null,
          { filter: {}, first: 10, after: 'invalid-cursor' },
          { user: null }
        )
      ).rejects.toThrow('Invalid cursor format');
    });

    test('should limit maximum results per request', async () => {
      // Mock cache miss
      productCacheService.getProductList.mockResolvedValue(null);
      productCacheService.setProductList.mockResolvedValue(true);

      const result = await productResolvers.Query.products(
        null,
        { filter: {}, first: 1000 }, // Request more than max
        { user: null }
      );

      // Should be limited to max 100
      expect(result.edges.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Query: product', () => {
    test('should return single product (cache miss)', async () => {
      // Mock cache miss
      productCacheService.getProduct.mockResolvedValue(null);
      productCacheService.setProduct.mockResolvedValue(true);

      const result = await productResolvers.Query.product(
        null,
        { id: sampleProducts[0]._id.toString() },
        { user: null }
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('iPhone 15 Pro');
      expect(result.category).toBe('Electronics');
      
      // Verify cache was checked and set
      expect(productCacheService.getProduct).toHaveBeenCalledWith(sampleProducts[0]._id.toString());
      expect(productCacheService.setProduct).toHaveBeenCalled();
    });

    test('should return cached product (cache hit)', async () => {
      const cachedProduct = { 
        id: sampleProducts[0]._id.toString(),
        name: 'Cached iPhone',
        category: 'Electronics'
      };

      // Mock cache hit
      productCacheService.getProduct.mockResolvedValue(cachedProduct);

      const result = await productResolvers.Query.product(
        null,
        { id: sampleProducts[0]._id.toString() },
        { user: null }
      );

      expect(result).toEqual(cachedProduct);
      
      // Verify cache was checked but not set
      expect(productCacheService.getProduct).toHaveBeenCalledWith(sampleProducts[0]._id.toString());
      expect(productCacheService.setProduct).not.toHaveBeenCalled();
    });

    test('should return null for non-existent product', async () => {
      // Mock cache miss
      productCacheService.getProduct.mockResolvedValue(null);

      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const result = await productResolvers.Query.product(
        null,
        { id: nonExistentId },
        { user: null }
      );

      expect(result).toBeNull();
    });

    test('should return null for inactive product', async () => {
      // Mock cache miss
      productCacheService.getProduct.mockResolvedValue(null);

      const result = await productResolvers.Query.product(
        null,
        { id: sampleProducts[4]._id.toString() }, // Inactive product
        { user: null }
      );

      expect(result).toBeNull();
    });

    test('should throw error for invalid ObjectId', async () => {
      await expect(
        productResolvers.Query.product(
          null,
          { id: 'invalid-id' },
          { user: null }
        )
      ).rejects.toThrow();
    });
  });

  describe('Query: popularProducts', () => {
    test('should return popular products (cache miss)', async () => {
      // Mock cache miss
      productCacheService.getPopularProducts.mockResolvedValue(null);
      productCacheService.setPopularProducts.mockResolvedValue(true);

      const result = await productResolvers.Query.popularProducts(
        null,
        { limit: 5 },
        { user: null }
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5);
      
      // Verify cache was checked and set
      expect(productCacheService.getPopularProducts).toHaveBeenCalledWith(5);
      expect(productCacheService.setPopularProducts).toHaveBeenCalled();
    });

    test('should return cached popular products (cache hit)', async () => {
      const cachedProducts = [sampleProducts[0], sampleProducts[1]];

      // Mock cache hit
      productCacheService.getPopularProducts.mockResolvedValue(cachedProducts);

      const result = await productResolvers.Query.popularProducts(
        null,
        { limit: 5 },
        { user: null }
      );

      expect(result).toEqual(cachedProducts);
      
      // Verify cache was checked but not set
      expect(productCacheService.getPopularProducts).toHaveBeenCalledWith(5);
      expect(productCacheService.setPopularProducts).not.toHaveBeenCalled();
    });

    test('should limit maximum results', async () => {
      // Mock cache miss
      productCacheService.getPopularProducts.mockResolvedValue(null);
      productCacheService.setPopularProducts.mockResolvedValue(true);

      const result = await productResolvers.Query.popularProducts(
        null,
        { limit: 1000 }, // Request more than max
        { user: null }
      );

      // Should be limited to max 50
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Query: productCategories', () => {
    test('should return category analytics (cache miss)', async () => {
      // Mock cache miss
      productCacheService.getCategories.mockResolvedValue(null);
      productCacheService.setCategories.mockResolvedValue(true);

      const result = await productResolvers.Query.productCategories(
        null,
        {},
        { user: null }
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Check structure
      expect(result[0]).toHaveProperty('category');
      expect(result[0]).toHaveProperty('productCount');
      expect(result[0]).toHaveProperty('averagePrice');
      expect(result[0]).toHaveProperty('totalStock');
      
      // Verify cache was checked and set
      expect(productCacheService.getCategories).toHaveBeenCalled();
      expect(productCacheService.setCategories).toHaveBeenCalled();
    });

    test('should return cached categories (cache hit)', async () => {
      const cachedCategories = [
        { category: 'Electronics', productCount: 3, averagePrice: 1099.99, totalStock: 75 }
      ];

      // Mock cache hit
      productCacheService.getCategories.mockResolvedValue(cachedCategories);

      const result = await productResolvers.Query.productCategories(
        null,
        {},
        { user: null }
      );

      expect(result).toEqual(cachedCategories);
      
      // Verify cache was checked but not set
      expect(productCacheService.getCategories).toHaveBeenCalled();
      expect(productCacheService.setCategories).not.toHaveBeenCalled();
    });
  });

  describe('Query: searchProducts', () => {
    test('should search products by name (cache miss)', async () => {
      // Mock cache miss
      productCacheService.getSearchResults.mockResolvedValue(null);
      productCacheService.setSearchResults.mockResolvedValue(true);

      const result = await productResolvers.Query.searchProducts(
        null,
        { query: 'iPhone', first: 10 },
        { user: null }
      );

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].node.name).toBe('iPhone 15 Pro');
      expect(result.totalCount).toBe(1);
      
      // Verify cache was checked and set
      expect(productCacheService.getSearchResults).toHaveBeenCalledWith('iPhone', {});
      expect(productCacheService.setSearchResults).toHaveBeenCalled();
    });

    test('should search products by description', async () => {
      // Mock cache miss
      productCacheService.getSearchResults.mockResolvedValue(null);
      productCacheService.setSearchResults.mockResolvedValue(true);

      const result = await productResolvers.Query.searchProducts(
        null,
        { query: 'gaming', first: 10 },
        { user: null }
      );

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].node.name).toBe('Gaming Headset');
    });

    test('should search products with filters', async () => {
      // Mock cache miss
      productCacheService.getSearchResults.mockResolvedValue(null);
      productCacheService.setSearchResults.mockResolvedValue(true);

      const result = await productResolvers.Query.searchProducts(
        null,
        { 
          query: 'electronics',
          filter: { minPrice: 500, inStock: true },
          first: 10 
        },
        { user: null }
      );

      expect(result.edges.length).toBeGreaterThan(0);
      result.edges.forEach(edge => {
        expect(edge.node.price).toBeGreaterThanOrEqual(500);
        expect(edge.node.stock).toBeGreaterThan(0);
      });
    });

    test('should return cached search results (cache hit)', async () => {
      const cachedResults = {
        edges: [{ node: sampleProducts[0], cursor: 'cursor123' }],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
        totalCount: 1
      };

      // Mock cache hit
      productCacheService.getSearchResults.mockResolvedValue(cachedResults);

      const result = await productResolvers.Query.searchProducts(
        null,
        { query: 'iPhone', first: 10 },
        { user: null }
      );

      expect(result).toEqual(cachedResults);
      
      // Verify cache was checked but not set
      expect(productCacheService.getSearchResults).toHaveBeenCalledWith('iPhone', {});
      expect(productCacheService.setSearchResults).not.toHaveBeenCalled();
    });

    test('should throw error for empty search query', async () => {
      await expect(
        productResolvers.Query.searchProducts(
          null,
          { query: '', first: 10 },
          { user: null }
        )
      ).rejects.toThrow('Search query is required');
    });

    test('should handle search pagination', async () => {
      // Mock cache miss
      productCacheService.getSearchResults.mockResolvedValue(null);
      productCacheService.setSearchResults.mockResolvedValue(true);

      const result = await productResolvers.Query.searchProducts(
        null,
        { query: 'Pro', first: 1 },
        { user: null }
      );

      expect(result.pageInfo).toBeDefined();
      expect(result.pageInfo.hasNextPage).toBeDefined();
    });
  });

  describe('Mutation: addProduct', () => {
    test('should create product and invalidate cache (admin)', async () => {
      productCacheService.invalidateProduct.mockResolvedValue(true);

      const input = {
        name: 'New Product',
        description: 'A new test product',
        category: 'Test',
        price: 99.99,
        stock: 10
      };

      const context = {
        user: { id: adminUser._id.toString(), role: 'admin' },
        isAuthenticated: true,
        isAdmin: true
      };

      const result = await productResolvers.Mutation.addProduct(
        null,
        { input },
        context
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('New Product');
      expect(result.category).toBe('Test');
      expect(result.price).toBe(99.99);
      expect(result.stock).toBe(10);
      expect(result.createdBy).toBeDefined();

      // Verify cache invalidation was called
      expect(productCacheService.invalidateProduct).toHaveBeenCalledWith(
        result._id,
        result
      );
    });

    test('should generate SKU automatically', async () => {
      productCacheService.invalidateProduct.mockResolvedValue(true);

      const input = {
        name: 'Auto SKU Product',
        category: 'Auto',
        price: 49.99,
        stock: 5
      };

      const context = {
        user: { id: adminUser._id.toString(), role: 'admin' },
        isAuthenticated: true,
        isAdmin: true
      };

      const result = await productResolvers.Mutation.addProduct(
        null,
        { input },
        context
      );

      expect(result.sku).toBeDefined();
      expect(result.sku).toMatch(/^AUTO-\d+-[A-Z0-9]{6}$/);
    });

    test('should validate required fields', async () => {
      const context = {
        user: { id: adminUser._id.toString(), role: 'admin' },
        isAuthenticated: true,
        isAdmin: true
      };

      // Test missing name
      await expect(
        productResolvers.Mutation.addProduct(
          null,
          { input: { category: 'Test', price: 99.99, stock: 10 } },
          context
        )
      ).rejects.toThrow('Product name is required');

      // Test missing category
      await expect(
        productResolvers.Mutation.addProduct(
          null,
          { input: { name: 'Test', price: 99.99, stock: 10 } },
          context
        )
      ).rejects.toThrow('Product category is required');

      // Test negative price
      await expect(
        productResolvers.Mutation.addProduct(
          null,
          { input: { name: 'Test', category: 'Test', price: -10, stock: 10 } },
          context
        )
      ).rejects.toThrow('Valid price is required');

      // Test negative stock
      await expect(
        productResolvers.Mutation.addProduct(
          null,
          { input: { name: 'Test', category: 'Test', price: 99.99, stock: -5 } },
          context
        )
      ).rejects.toThrow('Valid stock quantity is required');
    });
  });

  describe('Mutation: updateProduct', () => {
    test('should update product and invalidate cache (admin)', async () => {
      productCacheService.invalidateProduct.mockResolvedValue(true);

      const input = {
        name: 'Updated iPhone',
        price: 1099.99,
        stock: 40
      };

      const context = {
        user: { id: adminUser._id.toString(), role: 'admin' },
        isAuthenticated: true,
        isAdmin: true
      };

      const result = await productResolvers.Mutation.updateProduct(
        null,
        { id: sampleProducts[0]._id.toString(), input },
        context
      );

      expect(result.name).toBe('Updated iPhone');
      expect(result.price).toBe(1099.99);
      expect(result.stock).toBe(40);
      expect(result.category).toBe('Electronics'); // Unchanged

      // Verify cache invalidation was called
      expect(productCacheService.invalidateProduct).toHaveBeenCalledWith(
        result._id,
        result
      );
    });

    test('should validate partial updates', async () => {
      const context = {
        user: { id: adminUser._id.toString(), role: 'admin' },
        isAuthenticated: true,
        isAdmin: true
      };

      // Test empty name
      await expect(
        productResolvers.Mutation.updateProduct(
          null,
          { id: sampleProducts[0]._id.toString(), input: { name: '' } },
          context
        )
      ).rejects.toThrow('Product name cannot be empty');

      // Test negative price
      await expect(
        productResolvers.Mutation.updateProduct(
          null,
          { id: sampleProducts[0]._id.toString(), input: { price: -100 } },
          context
        )
      ).rejects.toThrow('Price cannot be negative');
    });

    test('should throw error for non-existent product', async () => {
      const context = {
        user: { id: adminUser._id.toString(), role: 'admin' },
        isAuthenticated: true,
        isAdmin: true
      };

      const nonExistentId = new mongoose.Types.ObjectId().toString();

      await expect(
        productResolvers.Mutation.updateProduct(
          null,
          { id: nonExistentId, input: { name: 'Updated' } },
          context
        )
      ).rejects.toThrow('Product not found');
    });
  });

  describe('Mutation: deleteProduct', () => {
    test('should soft delete product and invalidate cache (admin)', async () => {
      productCacheService.invalidateProduct.mockResolvedValue(true);

      const context = {
        user: { id: adminUser._id.toString(), role: 'admin' },
        isAuthenticated: true,
        isAdmin: true
      };

      const result = await productResolvers.Mutation.deleteProduct(
        null,
        { id: sampleProducts[0]._id.toString() },
        context
      );

      expect(result).toBe(true);

      // Verify product is soft deleted
      const deletedProduct = await Product.findById(sampleProducts[0]._id);
      expect(deletedProduct.isActive).toBe(false);

      // Verify cache invalidation was called
      expect(productCacheService.invalidateProduct).toHaveBeenCalled();
    });

    test('should throw error for non-existent product', async () => {
      const context = {
        user: { id: adminUser._id.toString(), role: 'admin' },
        isAuthenticated: true,
        isAdmin: true
      };

      const nonExistentId = new mongoose.Types.ObjectId().toString();

      await expect(
        productResolvers.Mutation.deleteProduct(
          null,
          { id: nonExistentId },
          context
        )
      ).rejects.toThrow('Product not found');
    });
  });

  describe('Field Resolvers', () => {
    test('Product.createdBy should resolve user', async () => {
      const product = { createdBy: adminUser._id };
      
      const result = await productResolvers.Product.createdBy(product);
      
      expect(result).toBeDefined();
      expect(result.email).toBe('admin@test.com');
      expect(result.firstName).toBe('Admin');
    });

    test('Product.createdBy should return populated user', async () => {
      const product = { createdBy: adminUser };
      
      const result = await productResolvers.Product.createdBy(product);
      
      expect(result).toEqual(adminUser);
    });

    test('Product.inStock should calculate stock status', () => {
      const inStockProduct = { stock: 10 };
      const outOfStockProduct = { stock: 0 };
      
      expect(productResolvers.Product.inStock(inStockProduct)).toBe(true);
      expect(productResolvers.Product.inStock(outOfStockProduct)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      // Temporarily close database connection
      await mongoose.disconnect();

      await expect(
        productResolvers.Query.products(
          null,
          { filter: {}, first: 10 },
          { user: null }
        )
      ).rejects.toThrow();

      // Reconnect for cleanup
      const mongoUri = mongoose.connection.getClient().getUri();
      await mongoose.connect(mongoUri);
    });

    test('should handle cache service errors gracefully', async () => {
      // Mock cache service to throw error
      productCacheService.getProductList.mockRejectedValue(new Error('Cache error'));
      productCacheService.setProductList.mockResolvedValue(true);

      // Should still work without cache
      const result = await productResolvers.Query.products(
        null,
        { filter: {}, first: 10 },
        { user: null }
      );

      expect(result.edges.length).toBeGreaterThan(0);
    });
  });
}); 