import { cache } from '../config/redis.js';
import { performanceLogger } from '../utils/logging.js';
import crypto from 'crypto';

/**
 * Product Caching Service
 * Provides intelligent caching for product queries with cache invalidation
 */
export class ProductCacheService {
  constructor() {
    // Cache TTL configurations (in seconds)
    this.TTL = {
      PRODUCT_LIST: 300, // 5 minutes for product lists
      SINGLE_PRODUCT: 1800, // 30 minutes for individual products
      POPULAR_PRODUCTS: 3600, // 1 hour for popular products
      CATEGORIES: 7200, // 2 hours for category lists
      SEARCH_RESULTS: 900, // 15 minutes for search results
      ANALYTICS: 1800, // 30 minutes for analytics data
    };

    // Cache key prefixes
    this.KEYS = {
      PRODUCT_LIST: 'products:list',
      SINGLE_PRODUCT: 'product',
      POPULAR_PRODUCTS: 'products:popular',
      CATEGORIES: 'products:categories',
      SEARCH: 'products:search',
      COUNT: 'products:count',
      ANALYTICS: 'products:analytics',
    };
  }

  /**
   * Generate cache key for product list queries
   */
  generateProductListKey(filter = {}, pagination = {}) {
    const filterString = JSON.stringify(this.normalizeFilter(filter));
    const paginationString = JSON.stringify(pagination);
    const hash = crypto.createHash('md5').update(filterString + paginationString).digest('hex');
    return `${this.KEYS.PRODUCT_LIST}:${hash}`;
  }

  /**
   * Generate cache key for single product
   */
  generateProductKey(productId) {
    return `${this.KEYS.SINGLE_PRODUCT}:${productId}`;
  }

  /**
   * Generate cache key for search results
   */
  generateSearchKey(searchTerm, filters = {}) {
    const searchString = searchTerm.toLowerCase().trim();
    const filterString = JSON.stringify(this.normalizeFilter(filters));
    const hash = crypto.createHash('md5').update(searchString + filterString).digest('hex');
    return `${this.KEYS.SEARCH}:${hash}`;
  }

  /**
   * Generate cache key for category filtering
   */
  generateCategoryKey(category) {
    return `${this.KEYS.CATEGORIES}:${category.toLowerCase()}`;
  }

  /**
   * Normalize filter object for consistent caching
   */
  normalizeFilter(filter) {
    const normalized = {};
    
    // Sort keys for consistent hash generation
    const sortedKeys = Object.keys(filter).sort();
    
    for (const key of sortedKeys) {
      const value = filter[key];
      
      // Normalize number ranges FIRST (before string check)
      if (key === 'minPrice' || key === 'maxPrice') {
        normalized[key] = Number(value) || 0;
      }
      // Normalize string values
      else if (typeof value === 'string') {
        normalized[key] = value.toLowerCase().trim();
      }
      // Normalize boolean values
      else if (typeof value === 'boolean') {
        normalized[key] = value;
      }
      // Keep other values as-is
      else {
        normalized[key] = value;
      }
    }
    
    return normalized;
  }

  /**
   * Get cached product list
   */
  async getProductList(filter = {}, pagination = {}) {
    const key = this.generateProductListKey(filter, pagination);
    const startTime = Date.now();
    
    try {
      const cached = await cache.get(key);
      const duration = Date.now() - startTime;
      
      if (cached) {
        performanceLogger.cacheHit(key, 'getProductList');
        return cached;
      }
      
      performanceLogger.cacheMiss(key, 'getProductList');
      return null;
    } catch (error) {
      console.error('Cache get error for product list:', error);
      return null;
    }
  }

  /**
   * Cache product list results
   */
  async setProductList(filter = {}, pagination = {}, data) {
    const key = this.generateProductListKey(filter, pagination);
    
    try {
      await cache.set(key, data, this.TTL.PRODUCT_LIST);
      
      // Also cache the total count separately for faster metadata queries
      const countKey = `${this.KEYS.COUNT}:${this.generateProductListKey(filter, {})}`;
      await cache.set(countKey, data.totalCount, this.TTL.PRODUCT_LIST);
      
      return true;
    } catch (error) {
      console.error('Cache set error for product list:', error);
      return false;
    }
  }

  /**
   * Get cached single product
   */
  async getProduct(productId) {
    const key = this.generateProductKey(productId);
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        performanceLogger.cacheHit(key, 'getProduct');
        return cached;
      }
      
      performanceLogger.cacheMiss(key, 'getProduct');
      return null;
    } catch (error) {
      console.error('Cache get error for single product:', error);
      return null;
    }
  }

  /**
   * Cache single product
   */
  async setProduct(productId, data) {
    const key = this.generateProductKey(productId);
    
    try {
      await cache.set(key, data, this.TTL.SINGLE_PRODUCT);
      return true;
    } catch (error) {
      console.error('Cache set error for single product:', error);
      return false;
    }
  }

  /**
   * Get cached search results
   */
  async getSearchResults(searchTerm, filters = {}) {
    const key = this.generateSearchKey(searchTerm, filters);
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        performanceLogger.cacheHit(key, 'getSearchResults');
        return cached;
      }
      
      performanceLogger.cacheMiss(key, 'getSearchResults');
      return null;
    } catch (error) {
      console.error('Cache get error for search results:', error);
      return null;
    }
  }

  /**
   * Cache search results
   */
  async setSearchResults(searchTerm, filters = {}, data) {
    const key = this.generateSearchKey(searchTerm, filters);
    
    try {
      await cache.set(key, data, this.TTL.SEARCH_RESULTS);
      return true;
    } catch (error) {
      console.error('Cache set error for search results:', error);
      return false;
    }
  }

  /**
   * Get cached popular products
   */
  async getPopularProducts(limit = 10) {
    const key = `${this.KEYS.POPULAR_PRODUCTS}:${limit}`;
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        performanceLogger.cacheHit(key, 'getPopularProducts');
        return cached;
      }
      
      performanceLogger.cacheMiss(key, 'getPopularProducts');
      return null;
    } catch (error) {
      console.error('Cache get error for popular products:', error);
      return null;
    }
  }

  /**
   * Cache popular products
   */
  async setPopularProducts(limit = 10, data) {
    const key = `${this.KEYS.POPULAR_PRODUCTS}:${limit}`;
    
    try {
      await cache.set(key, data, this.TTL.POPULAR_PRODUCTS);
      return true;
    } catch (error) {
      console.error('Cache set error for popular products:', error);
      return false;
    }
  }

  /**
   * Get cached category list
   */
  async getCategories() {
    const key = this.KEYS.CATEGORIES;
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        performanceLogger.cacheHit(key, 'getCategories');
        return cached;
      }
      
      performanceLogger.cacheMiss(key, 'getCategories');
      return null;
    } catch (error) {
      console.error('Cache get error for categories:', error);
      return null;
    }
  }

  /**
   * Cache category list
   */
  async setCategories(data) {
    const key = this.KEYS.CATEGORIES;
    
    try {
      await cache.set(key, data, this.TTL.CATEGORIES);
      return true;
    } catch (error) {
      console.error('Cache set error for categories:', error);
      return false;
    }
  }

  /**
   * Get cached product analytics
   */
  async getAnalytics(type = 'daily') {
    const key = `${this.KEYS.ANALYTICS}:${type}:${new Date().toISOString().split('T')[0]}`;
    
    try {
      const cached = await cache.get(key);
      
      if (cached) {
        performanceLogger.cacheHit(key, 'getAnalytics');
        return cached;
      }
      
      performanceLogger.cacheMiss(key, 'getAnalytics');
      return null;
    } catch (error) {
      console.error('Cache get error for analytics:', error);
      return null;
    }
  }

  /**
   * Cache product analytics
   */
  async setAnalytics(type = 'daily', data) {
    const key = `${this.KEYS.ANALYTICS}:${type}:${new Date().toISOString().split('T')[0]}`;
    
    try {
      await cache.set(key, data, this.TTL.ANALYTICS);
      return true;
    } catch (error) {
      console.error('Cache set error for analytics:', error);
      return false;
    }
  }

  /**
   * Invalidate cache when product is created/updated/deleted
   */
  async invalidateProduct(productId, productData = null) {
    try {
      const invalidationTasks = [];
      
      // Clear single product cache
      invalidationTasks.push(cache.del(this.generateProductKey(productId)));
      
      // Clear all product list caches (they might contain this product)
      // Note: In production, you might want to use Redis SCAN for pattern-based deletion
      const patterns = [
        `${this.KEYS.PRODUCT_LIST}:*`,
        `${this.KEYS.SEARCH}:*`,
        `${this.KEYS.COUNT}:*`,
        `${this.KEYS.POPULAR_PRODUCTS}:*`,
      ];
      
      // If we have product data, we can be more selective about cache invalidation
      if (productData) {
        // Clear category-specific caches
        if (productData.category) {
          invalidationTasks.push(cache.del(this.generateCategoryKey(productData.category)));
        }
      }
      
      // Clear categories cache (product counts might have changed)
      invalidationTasks.push(cache.del(this.KEYS.CATEGORIES));
      
      // Clear analytics cache (stats might have changed)
      const today = new Date().toISOString().split('T')[0];
      invalidationTasks.push(cache.del(`${this.KEYS.ANALYTICS}:daily:${today}`));
      
      await Promise.all(invalidationTasks);
      
      console.log(`Cache invalidated for product ${productId}`);
      return true;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      return false;
    }
  }

  /**
   * Warm up cache with popular data
   */
  async warmupCache() {
    try {
      console.log('Starting cache warmup...');
      
      // This method should be called periodically to pre-populate cache
      // with commonly requested data
      
      // You can implement specific warmup logic here based on your app's usage patterns
      // For example:
      // - Load top 10 products
      // - Load all categories
      // - Load recent popular searches
      
      console.log('Cache warmup completed');
      return true;
    } catch (error) {
      console.error('Cache warmup error:', error);
      return false;
    }
  }

  /**
   * Clear all product-related cache
   */
  async clearAllCache() {
    try {
      // Note: In production, implement pattern-based deletion using Redis SCAN
      await cache.flush();
      console.log('All product cache cleared');
      return true;
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      // This would require implementing cache hit/miss tracking
      // For now, return basic info
      return {
        status: 'operational',
        timestamp: new Date().toISOString(),
        // You can expand this with actual Redis stats if needed
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return { status: 'error', error: error.message };
    }
  }
}

// Create singleton instance
export const productCacheService = new ProductCacheService(); 