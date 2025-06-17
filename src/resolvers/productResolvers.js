import { GraphQLError } from 'graphql';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../utils/validation.js';
import { performanceLogger, graphqlLogger } from '../utils/logging.js';
import { productCacheService } from '../services/productCacheService.js';

export const productResolvers = {
  Query: {
    // Public query - get products with filtering and pagination
    products: async (parent, { filter = {}, first = 20, after }, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('products', { filter, first, after }, context);
        
        // Validate and limit pagination
        const limit = Math.min(first, 100); // Max 100 products per request

        // Check cache first
        const cacheData = await productCacheService.getProductList(filter, { first, after });
        if (cacheData) {
          const duration = Date.now() - startTime;
          graphqlLogger.operationComplete('products', duration, true);
          return cacheData;
        }
        
        // Build query filters
        const queryFilter = { isActive: true }; // Only show active products
        
        if (filter.category) {
          queryFilter.category = { $regex: new RegExp(filter.category, 'i') };
        }
        
        if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
          queryFilter.price = {};
          if (filter.minPrice !== undefined) {
            queryFilter.price.$gte = filter.minPrice;
          }
          if (filter.maxPrice !== undefined) {
            queryFilter.price.$lte = filter.maxPrice;
          }
        }
        
        if (filter.inStock === true) {
          queryFilter.stock = { $gt: 0 };
        } else if (filter.inStock === false) {
          queryFilter.stock = { $eq: 0 };
        }
        
        if (filter.search) {
          queryFilter.$text = { $search: filter.search };
        }
        
        // Base query
        let query = Product.find(queryFilter);
        
        // Handle cursor-based pagination
        if (after) {
          try {
            const cursor = Buffer.from(after, 'base64').toString();
            query = query.where('_id').gt(cursor);
          } catch (error) {
            throw new GraphQLError('Invalid cursor format', {
              extensions: { code: 'INVALID_CURSOR' }
            });
          }
        }
        
        // Execute query with limit + 1 to check for next page
        const products = await query
          .limit(limit + 1)
          .sort({ createdAt: -1, _id: 1 }) // Consistent sorting for pagination
          .populate('createdBy', 'id firstName lastName email');
        
        // Get total count for metadata
        const totalCount = await Product.countDocuments(queryFilter);
        
        // Determine pagination info
        const hasNextPage = products.length > limit;
        const edges = products.slice(0, limit).map(product => ({
          node: product,
          cursor: Buffer.from(product._id.toString()).toString('base64')
        }));
        
        const pageInfo = {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        };
        
        const duration = Date.now() - startTime;
        if (duration > 1000) {
          performanceLogger.slowQuery('products', duration, { filter, totalCount });
        }
        
        const result = {
          edges,
          pageInfo,
          totalCount,
        };

        // Cache the result
        await productCacheService.setProductList(filter, { first, after }, result);

        graphqlLogger.operationComplete('products', duration, true);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('products', duration, false, error.message);
        
        if (error instanceof GraphQLError) {
          throw error;
        }
        
        throw new GraphQLError('Failed to fetch products', {
          extensions: { code: 'FETCH_PRODUCTS_ERROR' }
        });
      }
    },

    // Public query - get single product by ID
    product: async (parent, { id }, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('product', { id }, context);
        
        validateObjectId(id);

        // Check cache first
        const cachedProduct = await productCacheService.getProduct(id);
        if (cachedProduct) {
          const duration = Date.now() - startTime;
          graphqlLogger.operationComplete('product', duration, true);
          return cachedProduct;
        }
        
        const product = await Product.findOne({ 
          _id: id, 
          isActive: true 
        }).populate('createdBy', 'id firstName lastName email');
        
        if (!product) {
          throw new GraphQLError('Product not found', {
            extensions: { code: 'PRODUCT_NOT_FOUND' }
          });
        }

        // Cache the product
        await productCacheService.setProduct(id, product);
        
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('product', duration, true);
        
        return product;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('product', duration, false, error.message);
        
        if (error instanceof GraphQLError) {
          throw error;
        }
        
        throw new GraphQLError('Failed to fetch product', {
          extensions: { code: 'FETCH_PRODUCT_ERROR' }
        });
      }
    },

    // Public query - get popular products (most frequently queried/ordered)
    popularProducts: async (parent, { limit = 10 }, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('popularProducts', { limit }, context);
        
        const limitValue = Math.min(limit, 50); // Max 50 products

        // Check cache first
        const cachedPopular = await productCacheService.getPopularProducts(limitValue);
        if (cachedPopular) {
          const duration = Date.now() - startTime;
          graphqlLogger.operationComplete('popularProducts', duration, true);
          return cachedPopular;
        }

        // For now, return products sorted by creation date
        // In a real app, you'd track view/order counts and sort by popularity
        const products = await Product.find({ isActive: true })
          .sort({ createdAt: -1 })
          .limit(limitValue)
          .populate('createdBy', 'id firstName lastName email');

        // Cache the result
        await productCacheService.setPopularProducts(limitValue, products);

        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('popularProducts', duration, true);
        
        return products;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('popularProducts', duration, false, error.message);
        
        throw new GraphQLError('Failed to fetch popular products', {
          extensions: { code: 'FETCH_POPULAR_PRODUCTS_ERROR' }
        });
      }
    },

    // Public query - get all product categories with counts
    productCategories: async (parent, args, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('productCategories', {}, context);

        // Check cache first
        const cachedCategories = await productCacheService.getCategories();
        if (cachedCategories) {
          const duration = Date.now() - startTime;
          graphqlLogger.operationComplete('productCategories', duration, true);
          return cachedCategories;
        }

        // Aggregate categories with product counts
        const categories = await Product.aggregate([
          { $match: { isActive: true } },
          { 
            $group: {
              _id: '$category',
              count: { $sum: 1 },
              averagePrice: { $avg: '$price' },
              totalStock: { $sum: '$stock' }
            }
          },
          { 
            $project: {
              category: '$_id',
              productCount: '$count',
              averagePrice: { $round: ['$averagePrice', 2] },
              totalStock: '$totalStock'
            }
          },
          { $sort: { category: 1 } }
        ]);

        // Cache the result
        await productCacheService.setCategories(categories);

        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('productCategories', duration, true);
        
        return categories;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('productCategories', duration, false, error.message);
        
        throw new GraphQLError('Failed to fetch product categories', {
          extensions: { code: 'FETCH_CATEGORIES_ERROR' }
        });
      }
    },

    // Public query - search products with enhanced text search
    searchProducts: async (parent, { query, filter = {}, first = 20, after }, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('searchProducts', { query, filter, first, after }, context);

        if (!query || query.trim().length === 0) {
          throw new GraphQLError('Search query is required', {
            extensions: { code: 'INVALID_INPUT' }
          });
        }

        const searchTerm = query.trim();
        const limit = Math.min(first, 100);

        // Check cache first
        const cacheData = await productCacheService.getSearchResults(searchTerm, filter);
        if (cacheData) {
          const duration = Date.now() - startTime;
          graphqlLogger.operationComplete('searchProducts', duration, true);
          return cacheData;
        }

        // Build search query - use either text search or regex, not both
        const searchQuery = {
          isActive: true,
          $or: [
            { name: { $regex: searchTerm, $options: 'i' } }, // Case-insensitive name search
            { description: { $regex: searchTerm, $options: 'i' } }, // Case-insensitive description search
            { category: { $regex: searchTerm, $options: 'i' } } // Case-insensitive category search
          ]
        };

        // Apply additional filters
        if (filter.category) {
          searchQuery.category = { $regex: filter.category, $options: 'i' };
        }

        if (filter.minPrice !== undefined) {
          searchQuery.price = { ...searchQuery.price, $gte: filter.minPrice };
        }

        if (filter.maxPrice !== undefined) {
          searchQuery.price = { ...searchQuery.price, $lte: filter.maxPrice };
        }

        if (filter.inStock !== undefined) {
          if (filter.inStock) {
            searchQuery.stock = { $gt: 0 };
          } else {
            searchQuery.stock = { $eq: 0 };
          }
        }

        let mongoQuery = Product.find(searchQuery);

        // Handle cursor pagination
        if (after) {
          try {
            const cursor = Buffer.from(after, 'base64').toString();
            mongoQuery = mongoQuery.where('_id').gt(cursor);
          } catch (error) {
            throw new GraphQLError('Invalid cursor format', {
              extensions: { code: 'INVALID_CURSOR' }
            });
          }
        }

        // Execute search with text score for relevance
        const products = await mongoQuery
          .limit(limit + 1)
          .sort({ createdAt: -1, _id: 1 }) // Remove text score sorting if no text search is used
          .populate('createdBy', 'id firstName lastName email');

        // Get total count
        const totalCount = await Product.countDocuments(searchQuery);

        // Determine pagination info
        const hasNextPage = products.length > limit;
        const edges = products.slice(0, limit).map(product => ({
          node: product,
          cursor: Buffer.from(product._id.toString()).toString('base64')
        }));

        const pageInfo = {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        };

        const result = {
          edges,
          pageInfo,
          totalCount,
        };

        // Cache the search results
        await productCacheService.setSearchResults(searchTerm, filter, result);

        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('searchProducts', duration, true);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error('Search products error details:', {
          message: error.message,
          stack: error.stack,
          query,
          filter
        });
        graphqlLogger.operationComplete('searchProducts', duration, false, error.message);
        
        if (error instanceof GraphQLError) {
          throw error;
        }
        
        throw new GraphQLError(`Failed to search products: ${error.message}`, {
          extensions: { code: 'SEARCH_PRODUCTS_ERROR' }
        });
      }
    },
  },

  Mutation: {
    // Admin only - add new product
    addProduct: requireAdmin(async (parent, { input }, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('addProduct', { input }, context);
        
        // Validate input
        if (!input.name || input.name.trim().length === 0) {
          throw new GraphQLError('Product name is required', {
            extensions: { code: 'INVALID_INPUT', field: 'name' }
          });
        }
        
        if (!input.category || input.category.trim().length === 0) {
          throw new GraphQLError('Product category is required', {
            extensions: { code: 'INVALID_INPUT', field: 'category' }
          });
        }
        
        if (input.price === undefined || input.price < 0) {
          throw new GraphQLError('Valid price is required', {
            extensions: { code: 'INVALID_INPUT', field: 'price' }
          });
        }
        
        if (input.stock === undefined || input.stock < 0) {
          throw new GraphQLError('Valid stock quantity is required', {
            extensions: { code: 'INVALID_INPUT', field: 'stock' }
          });
        }
        
        // Create product with current user as creator
        const productData = {
          ...input,
          name: input.name.trim(),
          category: input.category.trim(),
          description: input.description?.trim() || '',
          createdBy: context.user.id,
        };
        
        const product = await Product.create(productData);
        await product.populate('createdBy', 'id firstName lastName email');

        // Invalidate related cache
        await productCacheService.invalidateProduct(product._id, product);
        
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('addProduct', duration, true);
        
        return product;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('addProduct', duration, false, error.message);
        
        if (error instanceof GraphQLError) {
          throw error;
        }
        
        // Handle duplicate key errors (e.g., SKU conflicts)
        if (error.code === 11000) {
          throw new GraphQLError('Product with this SKU already exists', {
            extensions: { code: 'DUPLICATE_SKU' }
          });
        }
        
        throw new GraphQLError('Failed to create product', {
          extensions: { code: 'CREATE_PRODUCT_ERROR' }
        });
      }
    }),

    // Admin only - update existing product
    updateProduct: requireAdmin(async (parent, { id, input }, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('updateProduct', { id, input }, context);
        
        validateObjectId(id);
        
        // Find the product
        const product = await Product.findById(id);
        if (!product) {
          throw new GraphQLError('Product not found', {
            extensions: { code: 'PRODUCT_NOT_FOUND' }
          });
        }
        
        // Validate input if provided
        if (input.name !== undefined) {
          if (!input.name || input.name.trim().length === 0) {
            throw new GraphQLError('Product name cannot be empty', {
              extensions: { code: 'INVALID_INPUT', field: 'name' }
            });
          }
          product.name = input.name.trim();
        }
        
        if (input.category !== undefined) {
          if (!input.category || input.category.trim().length === 0) {
            throw new GraphQLError('Product category cannot be empty', {
              extensions: { code: 'INVALID_INPUT', field: 'category' }
            });
          }
          product.category = input.category.trim();
        }
        
        if (input.description !== undefined) {
          product.description = input.description?.trim() || '';
        }
        
        if (input.price !== undefined) {
          if (input.price < 0) {
            throw new GraphQLError('Price cannot be negative', {
              extensions: { code: 'INVALID_INPUT', field: 'price' }
            });
          }
          product.price = input.price;
        }
        
        if (input.stock !== undefined) {
          if (input.stock < 0) {
            throw new GraphQLError('Stock cannot be negative', {
              extensions: { code: 'INVALID_INPUT', field: 'stock' }
            });
          }
          product.stock = input.stock;
        }
        
        if (input.imageUrl !== undefined) {
          product.imageUrl = input.imageUrl?.trim() || '';
        }
        
        if (input.isActive !== undefined) {
          product.isActive = input.isActive;
        }
        
        // Save the updated product
        await product.save();
        await product.populate('createdBy', 'id firstName lastName email');

        // Invalidate related cache
        await productCacheService.invalidateProduct(product._id, product);
        
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('updateProduct', duration, true);
        
        return product;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('updateProduct', duration, false, error.message);
        
        if (error instanceof GraphQLError) {
          throw error;
        }
        
        // Handle duplicate key errors
        if (error.code === 11000) {
          throw new GraphQLError('Product with this SKU already exists', {
            extensions: { code: 'DUPLICATE_SKU' }
          });
        }
        
        throw new GraphQLError('Failed to update product', {
          extensions: { code: 'UPDATE_PRODUCT_ERROR' }
        });
      }
    }),

    // Admin only - delete product (soft delete)
    deleteProduct: requireAdmin(async (parent, { id }, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('deleteProduct', { id }, context);
        
        validateObjectId(id);
        
        // Find and soft delete the product
        const product = await Product.findById(id);
        if (!product) {
          throw new GraphQLError('Product not found', {
            extensions: { code: 'PRODUCT_NOT_FOUND' }
          });
        }
        
        // Soft delete by setting isActive to false
        product.isActive = false;
        await product.save();

        // Invalidate related cache
        await productCacheService.invalidateProduct(product._id, product);
        
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('deleteProduct', duration, true);
        
        return true;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        graphqlLogger.operationComplete('deleteProduct', duration, false, error.message);
        
        if (error instanceof GraphQLError) {
          throw error;
        }
        
        throw new GraphQLError('Failed to delete product', {
          extensions: { code: 'DELETE_PRODUCT_ERROR' }
        });
      }
    }),
  },

  // Field resolvers
  Product: {
    // Resolve the createdBy user field
    createdBy: async (product) => {
      if (product.createdBy && typeof product.createdBy === 'object') {
        // Already populated
        return product.createdBy;
      }
      
      // Need to populate
      if (product.createdBy) {
        return await User.findById(product.createdBy).select('id firstName lastName email');
      }
      
      return null;
    },
    
    // Virtual field for checking if product is in stock
    inStock: (product) => product.stock > 0,
  },
}; 