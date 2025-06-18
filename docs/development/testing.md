# Testing Guide

This guide covers the comprehensive testing strategy for GraphMarket, including unit tests, integration tests, end-to-end tests, and load testing.

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Coverage](#test-coverage)
- [Performance Testing](#performance-testing)
- [CI/CD Testing](#cicd-testing)
- [Best Practices](#best-practices)

## Testing Philosophy

GraphMarket follows a comprehensive testing pyramid approach:

```
    ╭─────────────╮
    │   E2E Tests │  ← Few, high-value integration tests
    ├─────────────┤
    │ Integration │  ← Medium number, API-level tests
    │    Tests    │
    ├─────────────┤
    │ Unit Tests  │  ← Many, fast, isolated tests
    ╰─────────────╯
```

### Testing Principles

1. **Test Early, Test Often**: Tests are written alongside code
2. **Fast Feedback**: Unit tests run in milliseconds, full suite under 60 seconds
3. **Reliable**: Tests are deterministic and don't depend on external factors
4. **Maintainable**: Tests are clear, focused, and easy to update
5. **Comprehensive**: Critical paths have 100% coverage

## Test Types

### 1. Unit Tests

**Purpose**: Test individual functions, methods, and components in isolation.

**Location**: `__tests__/resolvers/`, `__tests__/services/`, `__tests__/utils/`, `__tests__/middleware/`

**Characteristics**:
- Fast execution (< 100ms per test)
- No external dependencies (database, network, file system)
- High coverage of edge cases
- Mock external dependencies

**Example**:
```javascript
describe('validateEmail', () => {
  test('should pass for valid email', () => {
    expect(() => validateEmail('user@example.com')).not.toThrow();
  });

  test('should throw GraphQLError for invalid email format', () => {
    expect(() => validateEmail('invalid-email')).toThrow(GraphQLError);
  });
});
```

### 2. Integration Tests

**Purpose**: Test interactions between components, database operations, and API endpoints.

**Location**: `__tests__/integration/`, `__tests__/phase4/`

**Characteristics**:
- Test real database interactions
- Test GraphQL resolvers with context
- Test caching behavior
- Test middleware integration

**Example**:
```javascript
describe('Product Integration', () => {
  test('should create product and update cache', async () => {
    const result = await mutate({
      mutation: ADD_PRODUCT_MUTATION,
      variables: { input: productInput },
      context: { user: adminUser }
    });

    expect(result.data.addProduct).toMatchObject(productInput);
    
    // Verify cache invalidation
    const cached = await productCache.getProductList({});
    expect(cached).toBeNull();
  });
});
```

### 3. End-to-End Tests

**Purpose**: Test complete user workflows from start to finish.

**Location**: `__tests__/e2e/`

**Characteristics**:
- Test complete user journeys
- Test API with real HTTP requests
- Test authentication flows
- Test error scenarios

**Example**:
```javascript
describe('Complete E-commerce Workflow', () => {
  test('should complete customer journey: signup → browse → order → track', async () => {
    // 1. Customer signup
    const signupResult = await graphqlRequest(SIGNUP_MUTATION, variables);
    
    // 2. Browse products
    const productsResult = await graphqlRequest(GET_PRODUCTS_QUERY);
    
    // 3. Place order
    const orderResult = await graphqlRequest(PLACE_ORDER_MUTATION, orderInput, token);
    
    // 4. Track order
    const trackResult = await graphqlRequest(GET_ORDER_QUERY, { id: orderId }, token);
    
    expect(trackResult.data.order.status).toBe('PENDING');
  });
});
```

### 4. Load Tests

**Purpose**: Test system performance under various load conditions.

**Location**: `__tests__/load/`

**Characteristics**:
- Test concurrent user scenarios
- Measure response times and throughput
- Test system stability under load
- Test resource usage and memory leaks

**Example**:
```javascript
describe('Load Testing', () => {
  test('should handle 100 concurrent user registrations', async () => {
    const promises = Array.from({ length: 100 }, (_, i) => 
      testClient.query(SIGNUP_MUTATION, { 
        email: `user${i}@test.com`,
        password: 'Password123!'
      })
    );

    const results = await Promise.all(promises);
    const successRate = results.filter(r => !r.error).length / 100;
    
    expect(successRate).toBeGreaterThan(0.95); // 95% success rate
  });
});
```

## Running Tests

### Command Reference

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test types
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e          # End-to-end tests only
npm run test:load         # Load tests only

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test __tests__/resolvers/userResolvers.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should create user"

# Run tests with verbose output
npm test -- --verbose

# Run tests with specific timeout
npm test -- --testTimeout=30000
```

### Environment Setup

Tests use separate environment configuration:

```bash
# Test environment variables
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/graphmarket-test
REDIS_URI=redis://localhost:6379
JWT_SECRET=test-jwt-secret
LOG_LEVEL=error
```

### Database Management

Tests automatically:
- Connect to test database before running
- Clean data between test suites
- Close connections after completion

## Writing Tests

### Test Structure

Follow the **Arrange-Act-Assert** pattern:

```javascript
describe('Feature/Component', () => {
  // Setup
  beforeAll(async () => {
    // One-time setup
  });

  beforeEach(async () => {
    // Setup before each test
  });

  afterEach(async () => {
    // Cleanup after each test
  });

  afterAll(async () => {
    // One-time cleanup
  });

  describe('Specific functionality', () => {
    test('should do something when condition is met', async () => {
      // Arrange
      const input = { /* test data */ };
      const expected = { /* expected result */ };

      // Act
      const result = await functionUnderTest(input);

      // Assert
      expect(result).toEqual(expected);
    });
  });
});
```

### Naming Conventions

**Test Files**: `*.test.js`
**Test Descriptions**: Use descriptive names that explain the scenario
```javascript
// Good
test('should return 401 when user is not authenticated')
test('should create order and update inventory')

// Bad
test('authentication test')
test('order test')
```

### Mocking Guidelines

**Mock External Dependencies**:
```javascript
// Mock Redis for unit tests
jest.mock('../../src/utils/cache.js', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn()
}));
```

**Don't Mock What You're Testing**:
```javascript
// Don't mock the function you're testing
// Don't mock database models in integration tests
```

### Test Data Management

**Use Factories for Test Data**:
```javascript
const createTestUser = (overrides = {}) => ({
  email: 'test@example.com',
  password: 'Password123!',
  firstName: 'Test',
  lastName: 'User',
  role: 'customer',
  ...overrides
});

const createTestProduct = (overrides = {}) => ({
  name: 'Test Product',
  category: 'electronics',
  price: 99.99,
  stock: 10,
  ...overrides
});
```

## Test Coverage

### Coverage Thresholds

Current coverage requirements:
- **Statements**: 50%+
- **Branches**: 45%+
- **Functions**: 50%+
- **Lines**: 50%+

### Coverage Goals by Component

| Component | Target Coverage |
|-----------|-----------------|
| Resolvers | 85%+ |
| Services | 80%+ |
| Utils | 90%+ |
| Models | 70%+ |
| Middleware | 70%+ |

### Viewing Coverage

```bash
# Generate coverage report
npm test -- --coverage

# View HTML coverage report
open coverage/lcov-report/index.html

# Coverage by file
npm test -- --coverage --coverageReporters=text
```

### Coverage Exclusions

Some files are excluded from coverage requirements:
- Configuration files
- Build scripts
- Test utilities
- Generated code

## Performance Testing

### Load Testing Strategy

**Test Scenarios**:
1. **Concurrent Users**: 100+ simultaneous user registrations
2. **Product Queries**: 50+ concurrent product searches
3. **Mixed Workload**: 80% reads, 20% writes
4. **Stress Testing**: Gradual load increase
5. **Spike Testing**: Sudden load spikes
6. **Endurance Testing**: Sustained load over time

**Performance Metrics**:
- **Response Time**: < 200ms for cached queries, < 1s for mutations
- **Throughput**: 50+ requests/second for reads, 20+ for writes
- **Success Rate**: 95%+ under normal load, 90%+ under stress
- **Memory Usage**: < 50% growth under sustained load

**Load Test Example**:
```javascript
describe('Performance Tests', () => {
  test('should maintain response times under load', async () => {
    const concurrency = 50;
    const promises = Array.from({ length: concurrency }, () =>
      testClient.query(GET_PRODUCTS_QUERY)
    );

    const startTime = performance.now();
    const results = await Promise.all(promises);
    const endTime = performance.now();

    const avgResponseTime = (endTime - startTime) / concurrency;
    const successRate = results.filter(r => !r.error).length / concurrency;

    expect(avgResponseTime).toBeLessThan(200); // Under 200ms average
    expect(successRate).toBeGreaterThan(0.95); // 95% success rate
  });
});
```

## CI/CD Testing

### Pipeline Stages

1. **Unit Tests**: Fast feedback on code changes
2. **Integration Tests**: Database and API integration
3. **E2E Tests**: Complete workflow validation
4. **Load Tests**: Performance validation (main/develop only)
5. **Security Tests**: Vulnerability scanning

### Quality Gates

Tests must pass these gates before deployment:
- All unit tests pass
- Integration tests pass
- E2E tests pass
- Coverage thresholds met
- No high-severity security issues
- Performance benchmarks met

### Parallel Execution

Tests run in parallel across multiple Node.js versions:
- Node.js 18, 20, 22
- Different test types run in parallel
- Matrix builds for comprehensive validation

## Best Practices

### 1. Test Independence

```javascript
// Good: Each test is independent
describe('User Service', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    testUser = await User.create(createTestUser());
  });

  test('should find user by email', async () => {
    const user = await userService.findByEmail(testUser.email);
    expect(user).toBeDefined();
  });
});
```

### 2. Clear Test Names

```javascript
// Good: Descriptive test names
test('should return 404 when product does not exist')
test('should update inventory when order is placed')
test('should invalidate cache when product is updated')

// Bad: Vague test names
test('product test')
test('order functionality')
```

### 3. Test Edge Cases

```javascript
describe('Price Validation', () => {
  test('should accept valid positive price', () => {
    expect(() => validatePrice(99.99)).not.toThrow();
  });

  test('should reject negative price', () => {
    expect(() => validatePrice(-10)).toThrow();
  });

  test('should reject zero price', () => {
    expect(() => validatePrice(0)).toThrow();
  });

  test('should reject infinite price', () => {
    expect(() => validatePrice(Infinity)).toThrow();
  });

  test('should reject non-numeric price', () => {
    expect(() => validatePrice('not-a-number')).toThrow();
  });
});
```

### 4. Use Appropriate Assertions

```javascript
// Good: Specific assertions
expect(user.email).toBe('test@example.com');
expect(products).toHaveLength(5);
expect(order.totalAmount).toBeCloseTo(199.99, 2);
expect(response.errors).toBeUndefined();

// Bad: Generic assertions
expect(user).toBeTruthy();
expect(result).toBeDefined();
```

### 5. Test Error Conditions

```javascript
describe('Error Handling', () => {
  test('should throw authentication error when token is invalid', async () => {
    await expect(
      protectedResolver({}, {}, { user: null })
    ).rejects.toThrow('Authentication required');
  });

  test('should handle database connection errors gracefully', async () => {
    // Mock database error
    jest.spyOn(User, 'find').mockRejectedValue(new Error('Connection failed'));
    
    const result = await userService.findAll();
    expect(result).toBeNull();
  });
});
```

### 6. Keep Tests Fast

```javascript
// Good: Mock external dependencies in unit tests
jest.mock('../../src/services/emailService');

// Good: Use test database for integration tests
beforeAll(async () => {
  await ensureTestDBConnection();
});

// Bad: Make real API calls in unit tests
// Bad: Use production database
```

### 7. Clean Up Resources

```javascript
describe('File Operations', () => {
  const tempFiles = [];

  afterEach(async () => {
    // Clean up temp files
    for (const file of tempFiles) {
      await fs.unlink(file).catch(() => {});
    }
    tempFiles.length = 0;
  });
});
```

## Debugging Tests

### Common Issues

**1. Test Timeouts**
```javascript
// Increase timeout for slow tests
test('slow operation', async () => {
  // test code
}, 30000); // 30 second timeout
```

**2. Database State Issues**
```javascript
// Ensure proper cleanup
beforeEach(async () => {
  await User.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
});
```

**3. Async/Await Issues**
```javascript
// Always await async operations
test('async test', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

**4. Mock Issues**
```javascript
// Clear mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
```

### Debug Commands

```bash
# Run tests with debug output
npm test -- --verbose

# Run single test file
npm test __tests__/specific.test.js

# Run with Node.js debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Run with increased timeout
npm test -- --testTimeout=60000
```

## Continuous Improvement

### Metrics to Track

- Test execution time
- Test coverage trends
- Flaky test frequency
- Performance regression detection

### Regular Activities

- Review and update test coverage goals
- Refactor slow or flaky tests
- Update test data and scenarios
- Performance benchmark updates

This comprehensive testing strategy ensures GraphMarket maintains high quality, reliability, and performance standards throughout development and deployment. 