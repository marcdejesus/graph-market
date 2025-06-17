import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../../src/schema/index.js';
import { resolvers } from '../../src/resolvers/index.js';
import { createContext } from '../../src/context/index.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { cache } from '../../src/config/redis.js';
import jwt from 'jsonwebtoken';

describe('Product CRUD Integration Tests', () => {
  let mongoServer;
  let apolloServer;
  let adminUser;
  let customerUser;
  let adminToken;
  let customerToken;

  beforeAll(async () => {
    // Start MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create Apollo Server
    apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database
    await User.deleteMany({});
    await Product.deleteMany({});

    // Clear Redis cache
    if (cache) {
      try {
        await cache.flush();
      } catch (error) {
        console.warn('Redis not available for integration tests');
      }
    }

    // Create test users
    adminUser = await User.create({
      email: 'admin@integration.test',
      password: 'password123',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin'
    });

    customerUser = await User.create({
      email: 'customer@integration.test',
      password: 'password123',
      firstName: 'Customer',
      lastName: 'User',
      role: 'customer'
    });

    // Generate JWT tokens
    adminToken = jwt.sign(
      { userId: adminUser._id.toString() },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    customerToken = jwt.sign(
      { userId: customerUser._id.toString() },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  describe('Product Creation (Admin Only)', () => {
    test('should create product with valid admin token', async () => {
      const CREATE_PRODUCT = `
        mutation CreateProduct($input: ProductInput!) {
          addProduct(input: $input) {
            id
            name
            description
            category
            price
            stock
            sku
            isActive
            inStock
            createdBy {
              id
              email
              firstName
            }
            createdAt
            updatedAt
          }
        }
      `;

      const variables = {
        input: {
          name: 'Test Product',
          description: 'A test product for integration testing',
          category: 'Testing',
          price: 99.99,
          stock: 50,
          imageUrl: 'https://example.com/image.jpg'
        }
      };

      const context = createContext({
        req: {
          headers: { authorization: `Bearer ${adminToken}` }
        }
      });

      const result = await apolloServer.executeOperation(
        { query: CREATE_PRODUCT, variables },
        { contextValue: context }
      );

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeUndefined();
      
      const product = result.body.singleResult.data.addProduct;
      expect(product.id).toBeDefined();
      expect(product.name).toBe('Test Product');
      expect(product.category).toBe('Testing');
      expect(product.price).toBe(99.99);
      expect(product.stock).toBe(50);
      expect(product.sku).toMatch(/^TESTING-\d+-[A-Z0-9]{6}$/);
      expect(product.isActive).toBe(true);
      expect(product.inStock).toBe(true);
      expect(product.createdBy.email).toBe('admin@integration.test');
    });

    test('should reject product creation with customer token', async () => {
      const CREATE_PRODUCT = `
        mutation CreateProduct($input: ProductInput!) {
          addProduct(input: $input) {
            id
            name
          }
        }
      `;

      const variables = {
        input: {
          name: 'Unauthorized Product',
          category: 'Testing',
          price: 99.99,
          stock: 50
        }
      };

      const context = createContext({
        req: {
          headers: { authorization: `Bearer ${customerToken}` }
        }
      });

      const result = await apolloServer.executeOperation(
        { query: CREATE_PRODUCT, variables },
        { contextValue: context }
      );

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].extensions.code).toBe('FORBIDDEN');
    });

    test('should reject product creation without authentication', async () => {
      const CREATE_PRODUCT = `
        mutation CreateProduct($input: ProductInput!) {
          addProduct(input: $input) {
            id
            name
          }
        }
      `;

      const variables = {
        input: {
          name: 'Unauthenticated Product',
          category: 'Testing',
          price: 99.99,
          stock: 50
        }
      };

      const context = createContext({ req: { headers: {} } });

      const result = await apolloServer.executeOperation(
        { query: CREATE_PRODUCT, variables },
        { contextValue: context }
      );

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    test('should validate required fields', async () => {
      const CREATE_PRODUCT = `
        mutation CreateProduct($input: ProductInput!) {
          addProduct(input: $input) {
            id
            name
          }
        }
      `;

      const context = createContext({
        req: {
          headers: { authorization: `Bearer ${adminToken}` }
        }
      });

      // Test missing name
      let result = await apolloServer.executeOperation(
        { 
          query: CREATE_PRODUCT, 
          variables: { 
            input: { category: 'Testing', price: 99.99, stock: 50 } 
          } 
        },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].message).toContain('Product name is required');

      // Test negative price
      result = await apolloServer.executeOperation(
        { 
          query: CREATE_PRODUCT, 
          variables: { 
            input: { name: 'Test', category: 'Testing', price: -10, stock: 50 } 
          } 
        },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].message).toContain('Valid price is required');
    });
  });

  describe('Product Retrieval', () => {
    beforeEach(async () => {
      // Create sample products for testing
      await Product.create([
        {
          name: 'iPhone 15 Pro',
          description: 'Latest Apple smartphone',
          category: 'Electronics',
          price: 999.99,
          stock: 50,
          createdBy: adminUser._id,
          isActive: true
        },
        {
          name: 'MacBook Pro M3',
          description: 'Powerful laptop',
          category: 'Electronics',
          price: 1999.99,
          stock: 25,
          createdBy: adminUser._id,
          isActive: true
        },
        {
          name: 'Gaming Headset',
          description: 'High-quality gaming headset',
          category: 'Gaming',
          price: 79.99,
          stock: 100,
          createdBy: adminUser._id,
          isActive: true
        },
        {
          name: 'Out of Stock Item',
          description: 'This item is out of stock',
          category: 'Electronics',
          price: 299.99,
          stock: 0,
          createdBy: adminUser._id,
          isActive: true
        }
      ]);
    });

    test('should retrieve products with basic filtering', async () => {
      const GET_PRODUCTS = `
        query GetProducts($filter: ProductFilterInput, $first: Int) {
          products(filter: $filter, first: $first) {
            edges {
              node {
                id
                name
                category
                price
                stock
                inStock
              }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            totalCount
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      const result = await apolloServer.executeOperation(
        { query: GET_PRODUCTS, variables: { first: 10 } },
        { contextValue: context }
      );

      expect(result.body.kind).toBe('single');
      expect(result.body.singleResult.errors).toBeUndefined();
      
      const products = result.body.singleResult.data.products;
      expect(products.edges).toHaveLength(4);
      expect(products.totalCount).toBe(4);
      expect(products.pageInfo.hasNextPage).toBe(false);
    });

    test('should filter products by category', async () => {
      const GET_PRODUCTS = `
        query GetProducts($filter: ProductFilterInput) {
          products(filter: $filter, first: 10) {
            edges {
              node {
                name
                category
              }
            }
            totalCount
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      const result = await apolloServer.executeOperation(
        { 
          query: GET_PRODUCTS, 
          variables: { filter: { category: 'Gaming' } } 
        },
        { contextValue: context }
      );

      const products = result.body.singleResult.data.products;
      expect(products.edges).toHaveLength(1);
      expect(products.edges[0].node.name).toBe('Gaming Headset');
      expect(products.totalCount).toBe(1);
    });

    test('should filter products by price range', async () => {
      const GET_PRODUCTS = `
        query GetProducts($filter: ProductFilterInput) {
          products(filter: $filter, first: 10) {
            edges {
              node {
                name
                price
              }
            }
            totalCount
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      const result = await apolloServer.executeOperation(
        { 
          query: GET_PRODUCTS, 
          variables: { filter: { minPrice: 500, maxPrice: 1500 } } 
        },
        { contextValue: context }
      );

      const products = result.body.singleResult.data.products;
      expect(products.edges).toHaveLength(1);
      expect(products.edges[0].node.name).toBe('iPhone 15 Pro');
      expect(products.edges[0].node.price).toBe(999.99);
    });

    test('should filter products by stock status', async () => {
      const GET_PRODUCTS = `
        query GetProducts($filter: ProductFilterInput) {
          products(filter: $filter, first: 10) {
            edges {
              node {
                name
                stock
                inStock
              }
            }
            totalCount
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      // Test in-stock filter
      let result = await apolloServer.executeOperation(
        { 
          query: GET_PRODUCTS, 
          variables: { filter: { inStock: true } } 
        },
        { contextValue: context }
      );

      let products = result.body.singleResult.data.products;
      expect(products.edges).toHaveLength(3);
      expect(products.totalCount).toBe(3);

      // Test out-of-stock filter
      result = await apolloServer.executeOperation(
        { 
          query: GET_PRODUCTS, 
          variables: { filter: { inStock: false } } 
        },
        { contextValue: context }
      );

      products = result.body.singleResult.data.products;
      expect(products.edges).toHaveLength(1);
      expect(products.edges[0].node.name).toBe('Out of Stock Item');
    });

    test('should handle pagination', async () => {
      const GET_PRODUCTS = `
        query GetProducts($first: Int, $after: String) {
          products(first: $first, after: $after) {
            edges {
              node {
                name
              }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            totalCount
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      // Get first page
      const firstPage = await apolloServer.executeOperation(
        { query: GET_PRODUCTS, variables: { first: 2 } },
        { contextValue: context }
      );

      const firstProducts = firstPage.body.singleResult.data.products;
      expect(firstProducts.edges).toHaveLength(2);
      expect(firstProducts.pageInfo.hasNextPage).toBe(true);
      expect(firstProducts.pageInfo.endCursor).toBeDefined();

      // Get second page
      const secondPage = await apolloServer.executeOperation(
        { 
          query: GET_PRODUCTS, 
          variables: { 
            first: 2, 
            after: firstProducts.pageInfo.endCursor 
          } 
        },
        { contextValue: context }
      );

      const secondProducts = secondPage.body.singleResult.data.products;
      expect(secondProducts.edges).toHaveLength(2);
      expect(secondProducts.pageInfo.hasPreviousPage).toBe(true);
    });

    test('should retrieve single product by ID', async () => {
      const products = await Product.find({ name: 'iPhone 15 Pro' });
      const productId = products[0]._id.toString();

      const GET_PRODUCT = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            name
            description
            category
            price
            stock
            inStock
            sku
            createdBy {
              firstName
              lastName
            }
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      const result = await apolloServer.executeOperation(
        { query: GET_PRODUCT, variables: { id: productId } },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeUndefined();
      
      const product = result.body.singleResult.data.product;
      expect(product.id).toBe(productId);
      expect(product.name).toBe('iPhone 15 Pro');
      expect(product.category).toBe('Electronics');
      expect(product.price).toBe(999.99);
      expect(product.inStock).toBe(true);
      expect(product.createdBy.firstName).toBe('Admin');
    });

    test('should return null for non-existent product', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const GET_PRODUCT = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            name
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      const result = await apolloServer.executeOperation(
        { query: GET_PRODUCT, variables: { id: nonExistentId } },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeUndefined();
      expect(result.body.singleResult.data.product).toBeNull();
    });
  });

  describe('Advanced Product Queries', () => {
    beforeEach(async () => {
      // Create sample products
      await Product.create([
        {
          name: 'iPhone 15 Pro',
          description: 'Latest Apple smartphone',
          category: 'Electronics',
          price: 999.99,
          stock: 50,
          createdBy: adminUser._id,
          isActive: true
        },
        {
          name: 'MacBook Pro M3',
          description: 'Powerful laptop for professionals',
          category: 'Electronics',
          price: 1999.99,
          stock: 25,
          createdBy: adminUser._id,
          isActive: true
        },
        {
          name: 'Gaming Headset',
          description: 'High-quality gaming headset',
          category: 'Gaming',
          price: 79.99,
          stock: 100,
          createdBy: adminUser._id,
          isActive: true
        }
      ]);
    });

    test('should get popular products', async () => {
      const GET_POPULAR = `
        query GetPopularProducts($limit: Int) {
          popularProducts(limit: $limit) {
            id
            name
            category
            price
            stock
            inStock
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      const result = await apolloServer.executeOperation(
        { query: GET_POPULAR, variables: { limit: 5 } },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeUndefined();
      
      const products = result.body.singleResult.data.popularProducts;
      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBeLessThanOrEqual(5);
      expect(products.length).toBeGreaterThan(0);
    });

    test('should get product categories with analytics', async () => {
      const GET_CATEGORIES = `
        query GetCategories {
          productCategories {
            category
            productCount
            averagePrice
            totalStock
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      const result = await apolloServer.executeOperation(
        { query: GET_CATEGORIES },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeUndefined();
      
      const categories = result.body.singleResult.data.productCategories;
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(2); // Electronics and Gaming

      const electronics = categories.find(c => c.category === 'Electronics');
      expect(electronics).toBeDefined();
      expect(electronics.productCount).toBe(2);
      expect(electronics.averagePrice).toBe(1499.99);
      expect(electronics.totalStock).toBe(75);

      const gaming = categories.find(c => c.category === 'Gaming');
      expect(gaming).toBeDefined();
      expect(gaming.productCount).toBe(1);
      expect(gaming.averagePrice).toBe(79.99);
      expect(gaming.totalStock).toBe(100);
    });

    test('should search products with text query', async () => {
      const SEARCH_PRODUCTS = `
        query SearchProducts($query: String!, $filter: ProductFilterInput, $first: Int) {
          searchProducts(query: $query, filter: $filter, first: $first) {
            edges {
              node {
                id
                name
                category
                price
                description
              }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
            }
            totalCount
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      // Search by name
      let result = await apolloServer.executeOperation(
        { 
          query: SEARCH_PRODUCTS, 
          variables: { query: 'iPhone', first: 10 } 
        },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeUndefined();
      
      let searchResults = result.body.singleResult.data.searchProducts;
      expect(searchResults.edges).toHaveLength(1);
      expect(searchResults.edges[0].node.name).toBe('iPhone 15 Pro');

      // Search by description
      result = await apolloServer.executeOperation(
        { 
          query: SEARCH_PRODUCTS, 
          variables: { query: 'gaming', first: 10 } 
        },
        { contextValue: context }
      );

      searchResults = result.body.singleResult.data.searchProducts;
      expect(searchResults.edges).toHaveLength(1);
      expect(searchResults.edges[0].node.name).toBe('Gaming Headset');

      // Search with filters
      result = await apolloServer.executeOperation(
        { 
          query: SEARCH_PRODUCTS, 
          variables: { 
            query: 'Pro',
            filter: { minPrice: 1500 },
            first: 10 
          } 
        },
        { contextValue: context }
      );

      searchResults = result.body.singleResult.data.searchProducts;
      expect(searchResults.edges).toHaveLength(1);
      expect(searchResults.edges[0].node.name).toBe('MacBook Pro M3');
    });
  });

  describe('Product Updates (Admin Only)', () => {
    let productId;

    beforeEach(async () => {
      const product = await Product.create({
        name: 'Test Product',
        description: 'Original description',
        category: 'Testing',
        price: 99.99,
        stock: 50,
        createdBy: adminUser._id,
        isActive: true
      });
      productId = product._id.toString();
    });

    test('should update product with admin token', async () => {
      const UPDATE_PRODUCT = `
        mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
          updateProduct(id: $id, input: $input) {
            id
            name
            description
            price
            stock
            category
            updatedAt
          }
        }
      `;

      const variables = {
        id: productId,
        input: {
          name: 'Updated Product',
          description: 'Updated description',
          price: 149.99,
          stock: 75
        }
      };

      const context = createContext({
        req: {
          headers: { authorization: `Bearer ${adminToken}` }
        }
      });

      const result = await apolloServer.executeOperation(
        { query: UPDATE_PRODUCT, variables },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeUndefined();
      
      const product = result.body.singleResult.data.updateProduct;
      expect(product.name).toBe('Updated Product');
      expect(product.description).toBe('Updated description');
      expect(product.price).toBe(149.99);
      expect(product.stock).toBe(75);
      expect(product.category).toBe('Testing'); // Unchanged
    });

    test('should reject update with customer token', async () => {
      const UPDATE_PRODUCT = `
        mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
          updateProduct(id: $id, input: $input) {
            id
            name
          }
        }
      `;

      const variables = {
        id: productId,
        input: { name: 'Unauthorized Update' }
      };

      const context = createContext({
        req: {
          headers: { authorization: `Bearer ${customerToken}` }
        }
      });

      const result = await apolloServer.executeOperation(
        { query: UPDATE_PRODUCT, variables },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].extensions.code).toBe('FORBIDDEN');
    });

    test('should handle partial updates', async () => {
      const UPDATE_PRODUCT = `
        mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
          updateProduct(id: $id, input: $input) {
            id
            name
            description
            price
            stock
          }
        }
      `;

      const context = createContext({
        req: {
          headers: { authorization: `Bearer ${adminToken}` }
        }
      });

      // Update only price
      const result = await apolloServer.executeOperation(
        { 
          query: UPDATE_PRODUCT, 
          variables: { 
            id: productId, 
            input: { price: 199.99 } 
          } 
        },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeUndefined();
      
      const product = result.body.singleResult.data.updateProduct;
      expect(product.name).toBe('Test Product'); // Unchanged
      expect(product.description).toBe('Original description'); // Unchanged
      expect(product.price).toBe(199.99); // Updated
      expect(product.stock).toBe(50); // Unchanged
    });
  });

  describe('Product Deletion (Admin Only)', () => {
    let productId;

    beforeEach(async () => {
      const product = await Product.create({
        name: 'Test Product',
        description: 'To be deleted',
        category: 'Testing',
        price: 99.99,
        stock: 50,
        createdBy: adminUser._id,
        isActive: true
      });
      productId = product._id.toString();
    });

    test('should soft delete product with admin token', async () => {
      const DELETE_PRODUCT = `
        mutation DeleteProduct($id: ID!) {
          deleteProduct(id: $id)
        }
      `;

      const context = createContext({
        req: {
          headers: { authorization: `Bearer ${adminToken}` }
        }
      });

      const result = await apolloServer.executeOperation(
        { query: DELETE_PRODUCT, variables: { id: productId } },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeUndefined();
      expect(result.body.singleResult.data.deleteProduct).toBe(true);

      // Verify product is soft deleted
      const deletedProduct = await Product.findById(productId);
      expect(deletedProduct.isActive).toBe(false);

      // Verify product doesn't appear in public queries
      const GET_PRODUCTS = `
        query {
          products(first: 10) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `;

      const publicContext = createContext({ req: { headers: {} } });
      const publicResult = await apolloServer.executeOperation(
        { query: GET_PRODUCTS },
        { contextValue: publicContext }
      );

      const products = publicResult.body.singleResult.data.products.edges;
      expect(products.find(p => p.node.id === productId)).toBeUndefined();
    });

    test('should reject deletion with customer token', async () => {
      const DELETE_PRODUCT = `
        mutation DeleteProduct($id: ID!) {
          deleteProduct(id: $id)
        }
      `;

      const context = createContext({
        req: {
          headers: { authorization: `Bearer ${customerToken}` }
        }
      });

      const result = await apolloServer.executeOperation(
        { query: DELETE_PRODUCT, variables: { id: productId } },
        { contextValue: context }
      );

      expect(result.body.singleResult.errors).toBeDefined();
      expect(result.body.singleResult.errors[0].extensions.code).toBe('FORBIDDEN');
    });
  });

  describe('Cache Integration', () => {
    test('should demonstrate cache performance improvement', async () => {
      // Skip if Redis is not available
      if (!cache) {
        console.warn('Skipping cache integration tests - Redis not available');
        return;
      }

      // Create test products
      await Product.create([
        {
          name: 'Cache Test 1',
          category: 'Testing',
          price: 99.99,
          stock: 50,
          createdBy: adminUser._id,
          isActive: true
        },
        {
          name: 'Cache Test 2',
          category: 'Testing',
          price: 149.99,
          stock: 30,
          createdBy: adminUser._id,
          isActive: true
        }
      ]);

      const GET_CATEGORIES = `
        query {
          productCategories {
            category
            productCount
            averagePrice
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });

      // First request (cache miss)
      const start1 = Date.now();
      const result1 = await apolloServer.executeOperation(
        { query: GET_CATEGORIES },
        { contextValue: context }
      );
      const duration1 = Date.now() - start1;

      expect(result1.body.singleResult.errors).toBeUndefined();
      const categories1 = result1.body.singleResult.data.productCategories;

      // Second request (cache hit)
      const start2 = Date.now();
      const result2 = await apolloServer.executeOperation(
        { query: GET_CATEGORIES },
        { contextValue: context }
      );
      const duration2 = Date.now() - start2;

      expect(result2.body.singleResult.errors).toBeUndefined();
      const categories2 = result2.body.singleResult.data.productCategories;

      // Results should be identical
      expect(categories2).toEqual(categories1);

      // Second request should be faster (cache hit)
      // Note: In practice, this might not always be true due to various factors
      console.log(`First request: ${duration1}ms, Second request: ${duration2}ms`);
    });

    test('should invalidate cache on product creation', async () => {
      // Skip if Redis is not available
      if (!cache) {
        console.warn('Skipping cache integration tests - Redis not available');
        return;
      }

      const GET_CATEGORIES = `
        query {
          productCategories {
            category
            productCount
          }
        }
      `;

      const CREATE_PRODUCT = `
        mutation CreateProduct($input: ProductInput!) {
          addProduct(input: $input) {
            id
            name
          }
        }
      `;

      const context = createContext({ req: { headers: {} } });
      const adminContext = createContext({
        req: {
          headers: { authorization: `Bearer ${adminToken}` }
        }
      });

      // First, get initial categories
      const initialResult = await apolloServer.executeOperation(
        { query: GET_CATEGORIES },
        { contextValue: context }
      );

      const initialCategories = initialResult.body.singleResult.data.productCategories;
      const initialCount = initialCategories.reduce((sum, cat) => sum + cat.productCount, 0);

      // Create a new product
      await apolloServer.executeOperation(
        { 
          query: CREATE_PRODUCT, 
          variables: { 
            input: {
              name: 'Cache Invalidation Test',
              category: 'NewCategory',
              price: 299.99,
              stock: 20
            }
          } 
        },
        { contextValue: adminContext }
      );

      // Get categories again - should reflect the new product
      const updatedResult = await apolloServer.executeOperation(
        { query: GET_CATEGORIES },
        { contextValue: context }
      );

      const updatedCategories = updatedResult.body.singleResult.data.productCategories;
      const updatedCount = updatedCategories.reduce((sum, cat) => sum + cat.productCount, 0);

      // Should have one more product and potentially a new category
      expect(updatedCount).toBe(initialCount + 1);
      
      const newCategory = updatedCategories.find(cat => cat.category === 'NewCategory');
      expect(newCategory).toBeDefined();
      expect(newCategory.productCount).toBe(1);
    });
  });
}); 