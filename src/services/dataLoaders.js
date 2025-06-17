import DataLoader from 'dataloader';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { cache } from '../config/redis.js';
import { performanceLogger } from '../utils/logging.js';

/**
 * DataLoader Factory for creating efficient batch loaders
 * Prevents N+1 query problems in GraphQL resolvers
 */
export class DataLoaderFactory {
  constructor() {
    this.loaders = new Map();
  }

  /**
   * Create or get existing user loader
   */
  createUserLoader() {
    if (!this.loaders.has('user')) {
      this.loaders.set('user', new DataLoader(
        async (userIds) => {
          const startTime = Date.now();
          
          try {
            // Try cache first for batch
            const cacheKeys = userIds.map(id => `user:profile:${id}`);
            const cachedUsers = await cache.mget(cacheKeys);
            
            const uncachedIds = [];
            const results = [];
            
            // Identify which users need to be fetched from DB
            userIds.forEach((id, index) => {
              if (cachedUsers[index]) {
                results[index] = cachedUsers[index];
                performanceLogger.cacheHit(cacheKeys[index], 'userLoader');
              } else {
                uncachedIds.push({ id, index });
                performanceLogger.cacheMiss(cacheKeys[index], 'userLoader');
              }
            });
            
            // Fetch uncached users from database
            if (uncachedIds.length > 0) {
              const dbUserIds = uncachedIds.map(item => item.id);
              const dbUsers = await User.find({ 
                _id: { $in: dbUserIds }, 
                isActive: true 
              }).select('-password').lean();
              
              // Create lookup map
              const userMap = new Map(dbUsers.map(user => [user._id.toString(), user]));
              
              // Cache and assign results
              const cacheOperations = [];
              uncachedIds.forEach(({ id, index }) => {
                const user = userMap.get(id.toString());
                results[index] = user || null;
                
                if (user) {
                  cacheOperations.push([`user:profile:${id}`, user]);
                }
              });
              
              // Batch cache the fetched users
              if (cacheOperations.length > 0) {
                await cache.mset(cacheOperations, 3600); // 1 hour TTL
              }
            }
            
            const duration = Date.now() - startTime;
            performanceLogger.info('DataLoader batch users loaded', {
              batchSize: userIds.length,
              cacheHits: cachedUsers.filter(Boolean).length,
              dbQueries: uncachedIds.length > 0 ? 1 : 0,
              duration,
            });
            
            return results;
          } catch (error) {
            console.error('DataLoader user batch error:', error);
            return userIds.map(() => null);
          }
        },
        {
          // DataLoader options
          maxBatchSize: 100,
          cacheKeyFn: (key) => key.toString(),
          batchScheduleFn: (callback) => setTimeout(callback, 1), // 1ms batch window
        }
      ));
    }
    
    return this.loaders.get('user');
  }

  /**
   * Create or get existing product loader
   */
  createProductLoader() {
    if (!this.loaders.has('product')) {
      this.loaders.set('product', new DataLoader(
        async (productIds) => {
          const startTime = Date.now();
          
          try {
            // Try cache first for batch
            const cacheKeys = productIds.map(id => `product:${id}`);
            const cachedProducts = await cache.mget(cacheKeys);
            
            const uncachedIds = [];
            const results = [];
            
            // Identify which products need to be fetched from DB
            productIds.forEach((id, index) => {
              if (cachedProducts[index]) {
                results[index] = cachedProducts[index];
                performanceLogger.cacheHit(cacheKeys[index], 'productLoader');
              } else {
                uncachedIds.push({ id, index });
                performanceLogger.cacheMiss(cacheKeys[index], 'productLoader');
              }
            });
            
            // Fetch uncached products from database
            if (uncachedIds.length > 0) {
              const dbProductIds = uncachedIds.map(item => item.id);
              const dbProducts = await Product.find({ 
                _id: { $in: dbProductIds }, 
                isActive: true 
              }).populate('createdBy', 'firstName lastName email').lean();
              
              // Create lookup map
              const productMap = new Map(dbProducts.map(product => [product._id.toString(), product]));
              
              // Cache and assign results
              const cacheOperations = [];
              uncachedIds.forEach(({ id, index }) => {
                const product = productMap.get(id.toString());
                results[index] = product || null;
                
                if (product) {
                  cacheOperations.push([`product:${id}`, product]);
                }
              });
              
              // Batch cache the fetched products
              if (cacheOperations.length > 0) {
                await cache.mset(cacheOperations, 1800); // 30 minutes TTL
              }
            }
            
            const duration = Date.now() - startTime;
            performanceLogger.info('DataLoader batch products loaded', {
              batchSize: productIds.length,
              cacheHits: cachedProducts.filter(Boolean).length,
              dbQueries: uncachedIds.length > 0 ? 1 : 0,
              duration,
            });
            
            return results;
          } catch (error) {
            console.error('DataLoader product batch error:', error);
            return productIds.map(() => null);
          }
        },
        {
          maxBatchSize: 100,
          cacheKeyFn: (key) => key.toString(),
          batchScheduleFn: (callback) => setTimeout(callback, 1),
        }
      ));
    }
    
    return this.loaders.get('product');
  }

  /**
   * Create or get existing order loader for user orders
   */
  createUserOrdersLoader() {
    if (!this.loaders.has('userOrders')) {
      this.loaders.set('userOrders', new DataLoader(
        async (userIds) => {
          const startTime = Date.now();
          
          try {
            // Fetch orders for all users in one query
            const orders = await Order.find({ 
              user: { $in: userIds } 
            })
            .populate('items.product', 'name price imageUrl')
            .sort({ createdAt: -1 })
            .lean();
            
            // Group orders by user
            const ordersByUser = new Map();
            userIds.forEach(userId => {
              ordersByUser.set(userId.toString(), []);
            });
            
            orders.forEach(order => {
              const userId = order.user.toString();
              if (ordersByUser.has(userId)) {
                ordersByUser.get(userId).push(order);
              }
            });
            
            const results = userIds.map(userId => ordersByUser.get(userId.toString()) || []);
            
            const duration = Date.now() - startTime;
            performanceLogger.info('DataLoader batch user orders loaded', {
              batchSize: userIds.length,
              totalOrders: orders.length,
              dbQueries: 1,
              duration,
            });
            
            return results;
          } catch (error) {
            console.error('DataLoader user orders batch error:', error);
            return userIds.map(() => []);
          }
        },
        {
          maxBatchSize: 50,
          cacheKeyFn: (key) => key.toString(),
          batchScheduleFn: (callback) => setTimeout(callback, 1),
        }
      ));
    }
    
    return this.loaders.get('userOrders');
  }

  /**
   * Create or get existing product creator loader
   */
  createProductCreatorLoader() {
    if (!this.loaders.has('productCreator')) {
      this.loaders.set('productCreator', new DataLoader(
        async (productIds) => {
          const startTime = Date.now();
          
          try {
            // Get products with creator info
            const products = await Product.find({ 
              _id: { $in: productIds } 
            }).populate('createdBy', 'firstName lastName email role').lean();
            
            // Create lookup map
            const productMap = new Map(products.map(product => [product._id.toString(), product.createdBy]));
            
            const results = productIds.map(id => productMap.get(id.toString()) || null);
            
            const duration = Date.now() - startTime;
            performanceLogger.info('DataLoader batch product creators loaded', {
              batchSize: productIds.length,
              dbQueries: 1,
              duration,
            });
            
            return results;
          } catch (error) {
            console.error('DataLoader product creator batch error:', error);
            return productIds.map(() => null);
          }
        },
        {
          maxBatchSize: 100,
          cacheKeyFn: (key) => key.toString(),
          batchScheduleFn: (callback) => setTimeout(callback, 1),
        }
      ));
    }
    
    return this.loaders.get('productCreator');
  }

  /**
   * Create or get existing order items loader
   */
  createOrderItemsLoader() {
    if (!this.loaders.has('orderItems')) {
      this.loaders.set('orderItems', new DataLoader(
        async (orderIds) => {
          const startTime = Date.now();
          
          try {
            const orders = await Order.find({ 
              _id: { $in: orderIds } 
            })
            .populate('items.product', 'name price imageUrl sku')
            .lean();
            
            // Create lookup map
            const orderMap = new Map(orders.map(order => [order._id.toString(), order.items]));
            
            const results = orderIds.map(id => orderMap.get(id.toString()) || []);
            
            const duration = Date.now() - startTime;
            performanceLogger.info('DataLoader batch order items loaded', {
              batchSize: orderIds.length,
              dbQueries: 1,
              duration,
            });
            
            return results;
          } catch (error) {
            console.error('DataLoader order items batch error:', error);
            return orderIds.map(() => []);
          }
        },
        {
          maxBatchSize: 50,
          cacheKeyFn: (key) => key.toString(),
          batchScheduleFn: (callback) => setTimeout(callback, 1),
        }
      ));
    }
    
    return this.loaders.get('orderItems');
  }

  /**
   * Clear all loaders (useful for testing or cache invalidation)
   */
  clearAll() {
    this.loaders.forEach(loader => loader.clearAll());
    this.loaders.clear();
  }

  /**
   * Clear specific loader
   */
  clear(loaderName) {
    if (this.loaders.has(loaderName)) {
      this.loaders.get(loaderName).clearAll();
      this.loaders.delete(loaderName);
    }
  }

  /**
   * Prime a loader with data (useful for caching known data)
   */
  prime(loaderName, key, value) {
    if (this.loaders.has(loaderName)) {
      this.loaders.get(loaderName).prime(key, value);
    }
  }

  /**
   * Get loader statistics for monitoring
   */
  getStats() {
    const stats = {};
    
    this.loaders.forEach((loader, name) => {
      stats[name] = {
        cacheSize: loader._cache ? loader._cache.size : 0,
        // DataLoader doesn't expose hit/miss stats directly,
        // but we can track this through performance logger
      };
    });
    
    return stats;
  }
}

/**
 * Create DataLoaders for GraphQL context
 * This function should be called for each GraphQL request
 */
export function createDataLoaders() {
  const factory = new DataLoaderFactory();
  
  return {
    userLoader: factory.createUserLoader(),
    productLoader: factory.createProductLoader(),
    userOrdersLoader: factory.createUserOrdersLoader(),
    productCreatorLoader: factory.createProductCreatorLoader(),
    orderItemsLoader: factory.createOrderItemsLoader(),
    
    // Utility methods
    clearAll: () => factory.clearAll(),
    getStats: () => factory.getStats(),
    prime: (loaderName, key, value) => factory.prime(loaderName, key, value),
  };
} 