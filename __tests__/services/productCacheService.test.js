import { ProductCacheService } from '../../src/services/productCacheService.js';
import crypto from 'crypto';

// Mock the redis cache
jest.mock('../../src/config/redis.js', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    flushall: jest.fn(),
  }
}));

// Mock the performance logger
jest.mock('../../src/utils/logging.js', () => ({
  performanceLogger: {
    cacheHit: jest.fn(),
    cacheMiss: jest.fn(),
  }
}));

import { cache } from '../../src/config/redis.js';
import { performanceLogger } from '../../src/utils/logging.js';

describe('ProductCacheService', () => {
  let cacheService;

  beforeEach(() => {
    cacheService = new ProductCacheService();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct TTL values', () => {
      expect(cacheService.TTL.PRODUCT_LIST).toBe(300);
      expect(cacheService.TTL.SINGLE_PRODUCT).toBe(1800);
      expect(cacheService.TTL.POPULAR_PRODUCTS).toBe(3600);
      expect(cacheService.TTL.CATEGORIES).toBe(7200);
      expect(cacheService.TTL.SEARCH_RESULTS).toBe(900);
      expect(cacheService.TTL.ANALYTICS).toBe(1800);
    });

    it('should initialize with correct key prefixes', () => {
      expect(cacheService.KEYS.PRODUCT_LIST).toBe('products:list');
      expect(cacheService.KEYS.SINGLE_PRODUCT).toBe('product');
      expect(cacheService.KEYS.POPULAR_PRODUCTS).toBe('products:popular');
      expect(cacheService.KEYS.CATEGORIES).toBe('products:categories');
      expect(cacheService.KEYS.SEARCH).toBe('products:search');
      expect(cacheService.KEYS.COUNT).toBe('products:count');
      expect(cacheService.KEYS.ANALYTICS).toBe('products:analytics');
    });
  });

  describe('key generation methods', () => {
    describe('generateProductListKey', () => {
      it('should generate consistent keys for same filter and pagination', () => {
        const filter = { category: 'electronics', minPrice: 100 };
        const pagination = { first: 10, after: 'cursor123' };
        
        const key1 = cacheService.generateProductListKey(filter, pagination);
        const key2 = cacheService.generateProductListKey(filter, pagination);
        
        expect(key1).toBe(key2);
        expect(key1).toContain('products:list:');
      });

      it('should generate different keys for different filters', () => {
        const filter1 = { category: 'electronics' };
        const filter2 = { category: 'books' };
        
        const key1 = cacheService.generateProductListKey(filter1);
        const key2 = cacheService.generateProductListKey(filter2);
        
        expect(key1).not.toBe(key2);
      });

      it('should handle empty filter and pagination', () => {
        const key = cacheService.generateProductListKey();
        expect(key).toContain('products:list:');
      });
    });

    describe('generateProductKey', () => {
      it('should generate correct key for product ID', () => {
        const productId = '507f1f77bcf86cd799439011';
        const key = cacheService.generateProductKey(productId);
        expect(key).toBe('product:507f1f77bcf86cd799439011');
      });
    });

    describe('generateSearchKey', () => {
      it('should generate consistent keys for same search term and filters', () => {
        const searchTerm = 'iPhone';
        const filters = { category: 'electronics' };
        
        const key1 = cacheService.generateSearchKey(searchTerm, filters);
        const key2 = cacheService.generateSearchKey(searchTerm, filters);
        
        expect(key1).toBe(key2);
        expect(key1).toContain('products:search:');
      });

      it('should normalize search terms (case and whitespace)', () => {
        const key1 = cacheService.generateSearchKey('  iPhone  ');
        const key2 = cacheService.generateSearchKey('iphone');
        
        expect(key1).toBe(key2);
      });
    });

    describe('generateCategoryKey', () => {
      it('should generate correct key for category', () => {
        const key = cacheService.generateCategoryKey('Electronics');
        expect(key).toBe('products:categories:electronics');
      });

      it('should normalize category to lowercase', () => {
        const key1 = cacheService.generateCategoryKey('ELECTRONICS');
        const key2 = cacheService.generateCategoryKey('electronics');
        expect(key1).toBe(key2);
      });
    });
  });

  describe('normalizeFilter', () => {
    it('should normalize string values to lowercase and trim whitespace', () => {
      const filter = { category: '  Electronics  ', brand: 'APPLE' };
      const normalized = cacheService.normalizeFilter(filter);
      
      expect(normalized.category).toBe('electronics');
      expect(normalized.brand).toBe('apple');
    });

    it('should normalize price values to numbers', () => {
      const filter = { minPrice: '100', maxPrice: '500' };
      const normalized = cacheService.normalizeFilter(filter);
      
      expect(normalized.minPrice).toBe(100);
      expect(normalized.maxPrice).toBe(500);
    });

    it('should handle invalid price values', () => {
      const filter = { minPrice: 'invalid', maxPrice: null };
      const normalized = cacheService.normalizeFilter(filter);
      
      expect(normalized.minPrice).toBe(0);
      expect(normalized.maxPrice).toBe(0);
    });

    it('should preserve boolean values', () => {
      const filter = { inStock: true, featured: false };
      const normalized = cacheService.normalizeFilter(filter);
      
      expect(normalized.inStock).toBe(true);
      expect(normalized.featured).toBe(false);
    });

    it('should sort keys for consistent ordering', () => {
      const filter = { z_category: 'electronics', a_brand: 'apple', m_price: 100 };
      const normalized = cacheService.normalizeFilter(filter);
      const keys = Object.keys(normalized);
      
      expect(keys).toEqual(['a_brand', 'm_price', 'z_category']);
    });

    it('should handle empty filter', () => {
      const normalized = cacheService.normalizeFilter({});
      expect(normalized).toEqual({});
    });
  });

  describe('cache operations', () => {
    describe('getProductList', () => {
      it('should return cached data when available', async () => {
        const mockData = { products: [], totalCount: 0 };
        cache.get.mockResolvedValue(mockData);
        
        const result = await cacheService.getProductList({}, {});
        
        expect(result).toBe(mockData);
        expect(performanceLogger.cacheHit).toHaveBeenCalled();
      });

      it('should return null when cache miss', async () => {
        cache.get.mockResolvedValue(null);
        
        const result = await cacheService.getProductList({}, {});
        
        expect(result).toBeNull();
        expect(performanceLogger.cacheMiss).toHaveBeenCalled();
      });

      it('should handle cache errors gracefully', async () => {
        cache.get.mockRejectedValue(new Error('Cache error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const result = await cacheService.getProductList({}, {});
        
        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith('Cache get error for product list:', expect.any(Error));
        
        consoleSpy.mockRestore();
      });
    });

    describe('setProductList', () => {
      it('should cache data successfully', async () => {
        const mockData = { products: [], totalCount: 5 };
        cache.set.mockResolvedValue(true);
        
        const result = await cacheService.setProductList({}, {}, mockData);
        
        expect(result).toBe(true);
        expect(cache.set).toHaveBeenCalledTimes(2); // Product list + count
      });

      it('should handle cache errors gracefully', async () => {
        cache.set.mockRejectedValue(new Error('Cache error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const result = await cacheService.setProductList({}, {}, {});
        
        expect(result).toBe(false);
        expect(consoleSpy).toHaveBeenCalled();
        
        consoleSpy.mockRestore();
      });
    });

    describe('getProduct', () => {
      it('should return cached product when available', async () => {
        const mockProduct = { _id: '123', name: 'Test Product' };
        cache.get.mockResolvedValue(mockProduct);
        
        const result = await cacheService.getProduct('123');
        
        expect(result).toBe(mockProduct);
        expect(performanceLogger.cacheHit).toHaveBeenCalled();
      });

      it('should return null when cache miss', async () => {
        cache.get.mockResolvedValue(null);
        
        const result = await cacheService.getProduct('123');
        
        expect(result).toBeNull();
        expect(performanceLogger.cacheMiss).toHaveBeenCalled();
      });

      it('should handle cache errors gracefully', async () => {
        cache.get.mockRejectedValue(new Error('Cache error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const result = await cacheService.getProduct('123');
        
        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        
        consoleSpy.mockRestore();
      });
    });

    describe('setProduct', () => {
      it('should cache product successfully', async () => {
        const mockProduct = { _id: '123', name: 'Test Product' };
        cache.set.mockResolvedValue(true);
        
        const result = await cacheService.setProduct('123', mockProduct);
        
        expect(result).toBe(true);
        expect(cache.set).toHaveBeenCalledWith('product:123', mockProduct, 1800);
      });

      it('should handle cache errors gracefully', async () => {
        cache.set.mockRejectedValue(new Error('Cache error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const result = await cacheService.setProduct('123', {});
        
        expect(result).toBe(false);
        expect(consoleSpy).toHaveBeenCalled();
        
        consoleSpy.mockRestore();
      });
    });

    describe('getSearchResults', () => {
      it('should return cached search results when available', async () => {
        const mockResults = { products: [], totalCount: 0 };
        cache.get.mockResolvedValue(mockResults);
        
        const result = await cacheService.getSearchResults('iphone', {});
        
        expect(result).toBe(mockResults);
        expect(performanceLogger.cacheHit).toHaveBeenCalled();
      });

      it('should return null when cache miss', async () => {
        cache.get.mockResolvedValue(null);
        
        const result = await cacheService.getSearchResults('iphone', {});
        
        expect(result).toBeNull();
        expect(performanceLogger.cacheMiss).toHaveBeenCalled();
      });

      it('should handle cache errors gracefully', async () => {
        cache.get.mockRejectedValue(new Error('Cache error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const result = await cacheService.getSearchResults('iphone', {});
        
        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        
        consoleSpy.mockRestore();
      });
    });
  });
}); 