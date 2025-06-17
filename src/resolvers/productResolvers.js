import { GraphQLError } from 'graphql';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../utils/validation.js';
import { performanceLogger, graphqlLogger } from '../utils/logging.js';

export const productResolvers = {
  Query: {
    // Public query - get products with filtering and pagination
    products: async (parent, { filter = {}, first = 20, after }, context) => {
      const startTime = Date.now();
      
      try {
        graphqlLogger.operationStart('products', { filter, first, after }, context);
        
        // Validate and limit pagination
        const limit = Math.min(first, 100); // Max 100 products per request
        
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
        
        graphqlLogger.operationComplete('products', duration, true);
        
        return {
          edges,
          pageInfo,
          totalCount,
        };
        
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
        
        const product = await Product.findOne({ 
          _id: id, 
          isActive: true 
        }).populate('createdBy', 'id firstName lastName email');
        
        if (!product) {
          throw new GraphQLError('Product not found', {
            extensions: { code: 'PRODUCT_NOT_FOUND' }
          });
        }
        
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