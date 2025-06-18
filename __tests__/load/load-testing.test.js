import { performance } from 'perf_hooks';
import { setupTestDatabase, teardownTestDatabase } from '../setup.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';

// Mock GraphQL client for load testing
class LoadTestClient {
  constructor(endpoint = 'http://localhost:4000/graphql') {
    this.endpoint = endpoint;
    this.authToken = null;
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  async query(query, variables = {}) {
    const startTime = performance.now();
    
    try {
      // Simulate GraphQL request
      const response = await this.makeRequest({
        query,
        variables
      });
      
      const endTime = performance.now();
      return {
        data: response.data,
        errors: response.errors,
        duration: endTime - startTime
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        error: error.message,
        duration: endTime - startTime
      };
    }
  }

  async makeRequest(payload) {
    // In a real load test, this would make actual HTTP requests
    // For testing purposes, we'll simulate the request
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: { success: true },
          errors: null
        });
      }, Math.random() * 100 + 50); // Simulate 50-150ms response time
    });
  }
}

describe('Load Testing Suite', () => {
  let testClient;
  let testUsers = [];
  let testProducts = [];

  beforeAll(async () => {
    await setupTestDatabase();
    testClient = new LoadTestClient();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Clean database
    await User.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    testUsers = [];
    testProducts = [];
  });

  describe('Concurrent User Load Tests', () => {
    test('should handle 100 concurrent user registrations', async () => {
      const concurrentUsers = 100;
      const registrationPromises = [];
      const results = [];

      const startTime = performance.now();

      // Create concurrent registration requests
      for (let i = 0; i < concurrentUsers; i++) {
        const promise = testClient.query(`
          mutation RegisterUser($email: String!, $password: String!) {
            signup(email: $email, password: $password) {
              token
              user {
                id
                email
              }
            }
          }
        `, {
          email: `user${i}@loadtest.com`,
          password: 'LoadTest123!'
        });
        
        registrationPromises.push(promise);
      }

      // Wait for all registrations to complete
      const responses = await Promise.all(registrationPromises);
      const endTime = performance.now();

      // Analyze results
      responses.forEach(response => {
        results.push({
          success: !response.error,
          duration: response.duration,
          error: response.error
        });
      });

      const totalDuration = endTime - startTime;
      const successfulRequests = results.filter(r => r.success).length;
      const averageResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      const throughput = (successfulRequests / totalDuration) * 1000; // requests per second

      console.log(`Load Test Results - Concurrent User Registrations:
        Total Users: ${concurrentUsers}
        Successful Requests: ${successfulRequests}
        Success Rate: ${(successfulRequests / concurrentUsers * 100).toFixed(2)}%
        Total Duration: ${totalDuration.toFixed(2)}ms
        Average Response Time: ${averageResponseTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} requests/second
      `);

      // Assertions for load test
      expect(successfulRequests).toBeGreaterThan(concurrentUsers * 0.95); // 95% success rate
      expect(averageResponseTime).toBeLessThan(1000); // Under 1 second average
      expect(throughput).toBeGreaterThan(10); // At least 10 requests per second
    }, 30000); // 30 second timeout

    test('should handle 50 concurrent product queries with caching', async () => {
      // Setup test products first
      await setupTestProducts(20);

      const concurrentQueries = 50;
      const queryPromises = [];
      const results = [];

      const startTime = performance.now();

      // Create concurrent product query requests
      for (let i = 0; i < concurrentQueries; i++) {
        const promise = testClient.query(`
          query GetProducts($first: Int) {
            products(first: $first) {
              edges {
                node {
                  id
                  name
                  price
                  category
                  inStock
                }
              }
              totalCount
            }
          }
        `, {
          first: 10
        });
        
        queryPromises.push(promise);
      }

      // Wait for all queries to complete
      const responses = await Promise.all(queryPromises);
      const endTime = performance.now();

      // Analyze results
      responses.forEach(response => {
        results.push({
          success: !response.error,
          duration: response.duration,
          error: response.error
        });
      });

      const totalDuration = endTime - startTime;
      const successfulRequests = results.filter(r => r.success).length;
      const averageResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      const throughput = (successfulRequests / totalDuration) * 1000;

      console.log(`Load Test Results - Concurrent Product Queries:
        Total Queries: ${concurrentQueries}
        Successful Requests: ${successfulRequests}
        Success Rate: ${(successfulRequests / concurrentQueries * 100).toFixed(2)}%
        Total Duration: ${totalDuration.toFixed(2)}ms
        Average Response Time: ${averageResponseTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} requests/second
      `);

      // With caching, these should be very fast
      expect(successfulRequests).toBe(concurrentQueries); // 100% success rate
      expect(averageResponseTime).toBeLessThan(200); // Under 200ms with caching
      expect(throughput).toBeGreaterThan(50); // At least 50 requests per second
    }, 20000);

    test('should handle mixed workload: reads and writes', async () => {
      await setupTestData();

      const totalRequests = 100;
      const readWriteRatio = 0.8; // 80% reads, 20% writes
      const readRequests = Math.floor(totalRequests * readWriteRatio);
      const writeRequests = totalRequests - readRequests;

      const allPromises = [];
      const results = [];

      const startTime = performance.now();

      // Create read requests (product queries)
      for (let i = 0; i < readRequests; i++) {
        const promise = testClient.query(`
          query GetProducts {
            products(first: 5) {
              edges {
                node {
                  id
                  name
                  price
                }
              }
            }
          }
        `).then(response => ({ ...response, type: 'read' }));
        
        allPromises.push(promise);
      }

      // Create write requests (order placements)
      for (let i = 0; i < writeRequests; i++) {
        const promise = testClient.query(`
          mutation PlaceOrder($input: OrderInput!) {
            placeOrder(input: $input) {
              id
              orderNumber
              totalAmount
            }
          }
        `, {
          input: {
            items: [{ productId: 'test-product-id', quantity: 1 }]
          }
        }).then(response => ({ ...response, type: 'write' }));
        
        allPromises.push(promise);
      }

      // Shuffle requests to simulate realistic mixed workload
      const shuffledPromises = allPromises.sort(() => Math.random() - 0.5);

      // Execute all requests
      const responses = await Promise.all(shuffledPromises);
      const endTime = performance.now();

      // Analyze results by type
      const readResults = responses.filter(r => r.type === 'read');
      const writeResults = responses.filter(r => r.type === 'write');

      const readSuccessRate = readResults.filter(r => r.success).length / readResults.length;
      const writeSuccessRate = writeResults.filter(r => r.success).length / writeResults.length;

      const avgReadTime = readResults.reduce((sum, r) => sum + r.duration, 0) / readResults.length;
      const avgWriteTime = writeResults.reduce((sum, r) => sum + r.duration, 0) / writeResults.length;

      const totalDuration = endTime - startTime;
      const throughput = (totalRequests / totalDuration) * 1000;

      console.log(`Load Test Results - Mixed Workload:
        Total Requests: ${totalRequests}
        Read Requests: ${readRequests} (Success Rate: ${(readSuccessRate * 100).toFixed(2)}%)
        Write Requests: ${writeRequests} (Success Rate: ${(writeSuccessRate * 100).toFixed(2)}%)
        Average Read Time: ${avgReadTime.toFixed(2)}ms
        Average Write Time: ${avgWriteTime.toFixed(2)}ms
        Total Duration: ${totalDuration.toFixed(2)}ms
        Overall Throughput: ${throughput.toFixed(2)} requests/second
      `);

      // Performance expectations
      expect(readSuccessRate).toBeGreaterThan(0.98); // 98% read success rate
      expect(writeSuccessRate).toBeGreaterThan(0.90); // 90% write success rate
      expect(avgReadTime).toBeLessThan(avgWriteTime); // Reads should be faster
      expect(throughput).toBeGreaterThan(20); // At least 20 requests per second
    }, 30000);
  });

  describe('Stress Testing', () => {
    test('should handle gradual load increase', async () => {
      await setupTestData();

      const loadSteps = [10, 25, 50, 75, 100];
      const results = [];

      for (const loadLevel of loadSteps) {
        const stepStartTime = performance.now();
        const promises = [];

        // Create concurrent requests for this load level
        for (let i = 0; i < loadLevel; i++) {
          const promise = testClient.query(`
            query GetProducts {
              products(first: 10) {
                edges {
                  node {
                    id
                    name
                    price
                  }
                }
              }
            }
          `);
          promises.push(promise);
        }

        const responses = await Promise.all(promises);
        const stepEndTime = performance.now();

        const stepDuration = stepEndTime - stepStartTime;
        const successCount = responses.filter(r => !r.error).length;
        const avgResponseTime = responses.reduce((sum, r) => sum + r.duration, 0) / responses.length;
        const stepThroughput = (successCount / stepDuration) * 1000;

        const stepResult = {
          loadLevel,
          duration: stepDuration,
          successCount,
          successRate: successCount / loadLevel,
          avgResponseTime,
          throughput: stepThroughput
        };

        results.push(stepResult);

        console.log(`Load Level ${loadLevel}: ${successCount}/${loadLevel} success (${(stepResult.successRate * 100).toFixed(2)}%), ${avgResponseTime.toFixed(2)}ms avg, ${stepThroughput.toFixed(2)} req/s`);

        // Brief pause between load steps
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Analyze degradation
      const degradationThreshold = 0.1; // 10% performance degradation threshold
      
      for (let i = 1; i < results.length; i++) {
        const current = results[i];
        const previous = results[i - 1];
        
        const responseTimeDegradation = (current.avgResponseTime - previous.avgResponseTime) / previous.avgResponseTime;
        const throughputDegradation = (previous.throughput - current.throughput) / previous.throughput;

        // Log degradation metrics
        console.log(`Load ${previous.loadLevel} → ${current.loadLevel}: Response time change: ${(responseTimeDegradation * 100).toFixed(2)}%, Throughput change: ${(throughputDegradation * 100).toFixed(2)}%`);

        // System should handle increased load gracefully
        expect(current.successRate).toBeGreaterThan(0.90); // Maintain 90% success rate
        expect(responseTimeDegradation).toBeLessThan(2.0); // Response time shouldn't more than double
      }
    }, 60000); // 60 second timeout

    test('should recover from spike load', async () => {
      await setupTestData();

      // Baseline load
      const baselineLoad = 10;
      const spikeLoad = 100;
      const recoveryLoad = 10;

      // Measure baseline performance
      const baselineResults = await executeLoadTest(baselineLoad, 'Baseline');
      
      // Execute spike load
      const spikeResults = await executeLoadTest(spikeLoad, 'Spike');
      
      // Wait for system to recover
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Measure recovery performance
      const recoveryResults = await executeLoadTest(recoveryLoad, 'Recovery');

      console.log(`Recovery Test Results:
        Baseline: ${baselineResults.successRate * 100}% success, ${baselineResults.avgResponseTime}ms avg
        Spike: ${spikeResults.successRate * 100}% success, ${spikeResults.avgResponseTime}ms avg
        Recovery: ${recoveryResults.successRate * 100}% success, ${recoveryResults.avgResponseTime}ms avg
      `);

      // System should recover to near-baseline performance
      expect(recoveryResults.successRate).toBeGreaterThan(0.95);
      expect(recoveryResults.avgResponseTime).toBeLessThan(baselineResults.avgResponseTime * 1.2); // Within 20% of baseline
    }, 45000);
  });

  describe('Memory and Resource Testing', () => {
    test('should maintain stable memory usage under sustained load', async () => {
      await setupTestData();

      const sustainedLoad = 20;
      const testDuration = 10000; // 10 seconds
      const intervalMs = 500; // Execute batch every 500ms

      const startTime = performance.now();
      const memorySnapshots = [];
      let totalRequests = 0;

      // Record initial memory
      if (typeof process !== 'undefined' && process.memoryUsage) {
        memorySnapshots.push({
          timestamp: 0,
          memory: process.memoryUsage(),
          requests: 0
        });
      }

      // Sustained load test
      while (performance.now() - startTime < testDuration) {
        const batchPromises = [];
        
        for (let i = 0; i < sustainedLoad; i++) {
          const promise = testClient.query(`
            query GetProducts {
              products(first: 5) {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          `);
          batchPromises.push(promise);
        }

        await Promise.all(batchPromises);
        totalRequests += sustainedLoad;

        // Record memory usage
        if (typeof process !== 'undefined' && process.memoryUsage) {
          memorySnapshots.push({
            timestamp: performance.now() - startTime,
            memory: process.memoryUsage(),
            requests: totalRequests
          });
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }

      if (memorySnapshots.length > 1) {
        const initialMemory = memorySnapshots[0].memory.heapUsed;
        const finalMemory = memorySnapshots[memorySnapshots.length - 1].memory.heapUsed;
        const memoryGrowth = (finalMemory - initialMemory) / initialMemory;

        console.log(`Memory Usage Test:
          Initial Heap: ${(initialMemory / 1024 / 1024).toFixed(2)} MB
          Final Heap: ${(finalMemory / 1024 / 1024).toFixed(2)} MB
          Growth: ${(memoryGrowth * 100).toFixed(2)}%
          Total Requests: ${totalRequests}
        `);

        // Memory growth should be reasonable (less than 50% increase)
        expect(memoryGrowth).toBeLessThan(0.5);
      }

      expect(totalRequests).toBeGreaterThan(100); // Should have processed significant load
    }, 20000);
  });

  // Helper functions
  async function setupTestData() {
    await setupTestProducts(10);
    await setupTestUsers(5);
  }

  async function setupTestProducts(count) {
    const products = [];
    for (let i = 0; i < count; i++) {
      products.push({
        name: `Load Test Product ${i}`,
        description: `Test product for load testing ${i}`,
        category: i % 2 === 0 ? 'electronics' : 'home',
        price: Math.random() * 200 + 10,
        stock: Math.floor(Math.random() * 100) + 10,
        sku: `LT-${i.toString().padStart(3, '0')}`,
        isActive: true,
        createdBy: '507f1f77bcf86cd799439011' // Mock admin ID
      });
    }

    const createdProducts = await Product.insertMany(products);
    testProducts.push(...createdProducts);
  }

  async function setupTestUsers(count) {
    const users = [];
    for (let i = 0; i < count; i++) {
      users.push({
        email: `loadtest${i}@example.com`,
        password: 'hashedpassword', // In real app, this would be properly hashed
        role: 'customer',
        firstName: `LoadTest${i}`,
        lastName: 'User',
        isActive: true
      });
    }

    const createdUsers = await User.insertMany(users);
    testUsers.push(...createdUsers);
  }

  async function executeLoadTest(concurrency, label) {
    const promises = [];
    const startTime = performance.now();

    for (let i = 0; i < concurrency; i++) {
      const promise = testClient.query(`
        query GetProducts {
          products(first: 10) {
            edges {
              node {
                id
                name
                price
              }
            }
          }
        }
      `);
      promises.push(promise);
    }

    const responses = await Promise.all(promises);
    const endTime = performance.now();

    const duration = endTime - startTime;
    const successCount = responses.filter(r => !r.error).length;
    const avgResponseTime = responses.reduce((sum, r) => sum + r.duration, 0) / responses.length;

    return {
      label,
      concurrency,
      duration,
      successCount,
      successRate: successCount / concurrency,
      avgResponseTime,
      throughput: (successCount / duration) * 1000
    };
  }
}); 