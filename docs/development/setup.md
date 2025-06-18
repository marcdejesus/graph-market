# Developer Setup Guide

This guide will help you set up GraphMarket for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v8 or higher) 
- **MongoDB** (v5 or higher)
- **Redis** (v6 or higher)
- **Docker** (optional, for containerized development)
- **Git**

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/graph-market.git
cd graph-market
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Configure your environment variables:

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/graphmarket
MONGODB_TEST_URI=mongodb://localhost:27017/graphmarket_test

# Redis Configuration
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here

# Server Configuration
PORT=4000
NODE_ENV=development

# Logging Configuration
LOG_LEVEL=info

# Performance Configuration
ENABLE_QUERY_COMPLEXITY=true
MAX_QUERY_COMPLEXITY=1000
MAX_QUERY_DEPTH=15

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
```

### 4. Start Required Services

#### Option A: Using Docker (Recommended)

```bash
# Start MongoDB and Redis
docker-compose up -d mongodb redis

# Verify services are running
docker-compose ps
```

#### Option B: Manual Installation

**MongoDB:**
```bash
# macOS with Homebrew
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
sudo apt update
sudo apt install mongodb
sudo systemctl start mongodb

# Windows
# Download from https://www.mongodb.com/try/download/community
```

**Redis:**
```bash
# macOS with Homebrew
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server

# Windows
# Download from https://github.com/tporadowski/redis/releases
```

### 5. Initialize the Database

```bash
# Run database migrations/setup
npm run db:setup

# Seed with sample data (optional)
npm run db:seed
```

### 6. Start Development Server

```bash
npm run dev
```

The server will start at `http://localhost:4000`

GraphQL Playground will be available at `http://localhost:4000/graphql`

## Development Workflow

### Project Structure

```
graph-market/
├── src/
│   ├── context/           # GraphQL context creation
│   ├── middleware/        # Express middleware
│   ├── models/           # Mongoose models
│   ├── resolvers/        # GraphQL resolvers
│   ├── routes/           # Express routes
│   ├── schema/           # GraphQL schema
│   ├── services/         # Business logic services
│   └── utils/            # Utility functions
├── __tests__/            # Test files
├── docs/                 # Documentation
├── scripts/              # Build and deployment scripts
├── coverage/             # Test coverage reports
└── docker-compose.yml    # Docker configuration
```

### Available Scripts

```bash
# Development
npm run dev              # Start development server with hot reload
npm start               # Start production server

# Testing
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:unit       # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:coverage   # Run tests with coverage report

# Code Quality
npm run lint            # Run linter
npm run lint:fix        # Fix linting issues
npm run format          # Format code with Prettier

# Database
npm run db:setup        # Initialize database
npm run db:seed         # Seed with sample data
npm run db:reset        # Reset database

# Docker
npm run docker:build    # Build Docker image
npm run docker:up       # Start all services
npm run docker:down     # Stop all services
```

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/graphmarket` | Yes |
| `MONGODB_TEST_URI` | Test database connection string | `mongodb://localhost:27017/graphmarket_test` | Yes |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `PORT` | Server port | `4000` | No |
| `NODE_ENV` | Environment mode | `development` | No |
| `LOG_LEVEL` | Logging level | `info` | No |
| `ENABLE_QUERY_COMPLEXITY` | Enable query complexity analysis | `true` | No |
| `MAX_QUERY_COMPLEXITY` | Maximum query complexity | `1000` | No |
| `MAX_QUERY_DEPTH` | Maximum query depth | `15` | No |

## Database Setup

### MongoDB Collections

GraphMarket uses the following MongoDB collections:

- **users** - User accounts and authentication
- **products** - Product catalog
- **orders** - Customer orders and order items

### Sample Data

To populate your database with sample data for development:

```bash
npm run db:seed
```

This will create:
- 2 admin users
- 10 customer users  
- 50 sample products across various categories
- 20 sample orders

### Database Indexes

The following indexes are automatically created:

**Users Collection:**
```javascript
{ email: 1 } // Unique index
{ role: 1 }
{ isActive: 1 }
```

**Products Collection:**
```javascript
{ category: 1 }
{ price: 1 }
{ stock: 1 }
{ isActive: 1 }
{ name: "text", description: "text", category: "text" } // Text search
```

**Orders Collection:**
```javascript
{ user: 1 }
{ status: 1 }
{ createdAt: -1 }
```

## Redis Configuration

GraphMarket uses Redis for:

- **Caching**: Product queries, user sessions, search results
- **Rate Limiting**: Request rate limiting per IP
- **Session Management**: User session data and authentication tokens

### Redis Key Patterns

```
# Product Cache
products:all:{filter_hash}
product:{id}
search:{query_hash}

# User Cache  
user:{id}
session:user:{userId}
auth:token:{tokenHash}

# Rate Limiting
rate_limit:{ip}:{endpoint}
auth_attempts:{ip}
```

## Testing Setup

### Test Database

Tests use a separate database (`graphmarket_test`) that is:
- Automatically created before tests run
- Cleaned between test suites
- Dropped after all tests complete

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test __tests__/resolvers/userResolvers.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should create user"

# Run tests in watch mode
npm run test:watch
```

### Test Structure

```
__tests__/
├── context/              # Context creation tests
├── integration/          # API integration tests
├── middleware/           # Middleware tests
├── phase4/              # Phase 4 feature tests
├── resolvers/           # GraphQL resolver tests
├── services/            # Service layer tests
├── utils/               # Utility function tests
├── globalSetup.js       # Test setup
├── globalTeardown.js    # Test cleanup
└── setup.js             # Test configuration
```

## Development Tools

### GraphQL Playground

Access GraphQL Playground at `http://localhost:4000/graphql`

**Sample Query:**
```graphql
query GetProducts {
  products(first: 5) {
    edges {
      node {
        id
        name
        price
        category
      }
    }
  }
}
```

**Authentication:**
Add to HTTP Headers:
```json
{
  "Authorization": "Bearer your-jwt-token-here"
}
```

### MongoDB Compass

Use MongoDB Compass to visually explore your database:
- Connection string: `mongodb://localhost:27017`
- Database: `graphmarket`

### Redis CLI

Monitor Redis activity:
```bash
# Connect to Redis CLI
redis-cli

# Monitor all commands
MONITOR

# View all keys
KEYS *

# Get cache statistics
INFO stats
```

## Debugging

### VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug GraphMarket",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.js",
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeExecutable": "nodemon",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### Logging

GraphMarket uses Winston for structured logging:

```javascript
import { logger } from '../utils/logging.js';

// Log levels: error, warn, info, debug
logger.info('User created', { userId, email });
logger.error('Database error', { error: error.message });
```

View logs in development:
```bash
tail -f logs/app.log
```

### Performance Monitoring

Monitor API performance at `http://localhost:4000/api/performance/`

Available endpoints:
- `/api/performance/` - Performance dashboard
- `/api/performance/metrics` - Raw metrics data
- `/api/performance/cache/stats` - Cache statistics

## Troubleshooting

### Common Issues

**1. MongoDB Connection Error**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
Solution: Ensure MongoDB is running
```bash
# Check status
brew services list | grep mongodb
# Start MongoDB
brew services start mongodb-community
```

**2. Redis Connection Error**
```
Error: Redis connection failed
```
Solution: Ensure Redis is running
```bash
# Check status
brew services list | grep redis
# Start Redis
brew services start redis
```

**3. JWT Secret Missing**
```
Error: JWT_SECRET environment variable is required
```
Solution: Add JWT_SECRET to your `.env` file
```env
JWT_SECRET=your-super-secret-key-here
```

**4. Port Already in Use**
```
Error: listen EADDRINUSE :::4000
```
Solution: Kill process using port 4000 or change PORT in `.env`
```bash
# Find process using port 4000
lsof -ti:4000
# Kill the process
kill -9 $(lsof -ti:4000)
```

**5. Test Database Issues**
```
Error: Database connection timeout in tests
```
Solution: Increase test timeout in `jest.config.cjs`
```javascript
testTimeout: 45000, // 45 seconds
```

### Getting Help

1. Check the [API Documentation](../api/schema.md)
2. Review [Examples](../api/examples.md)
3. Check existing [GitHub Issues](https://github.com/your-username/graph-market/issues)
4. Create a new issue with:
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
   - Operating system
   - Error logs
   - Steps to reproduce

## Next Steps

After setup is complete:

1. **Explore the API**: Use GraphQL Playground to test queries
2. **Review the Code**: Start with `src/index.js` and explore the resolver structure
3. **Run Tests**: Ensure all tests pass with `npm test`
4. **Read Documentation**: Review the [API Schema](../api/schema.md) and [Examples](../api/examples.md)
5. **Make Changes**: Follow the [Development Workflow](./workflow.md) guide

## Production Considerations

When preparing for production deployment:

1. **Environment Variables**: Use production values for all environment variables
2. **Database**: Use MongoDB Atlas or a managed MongoDB service
3. **Redis**: Use Redis Cloud or a managed Redis service
4. **Security**: Review the security checklist in [Deployment Guide](../deployment/deployment.md)
5. **Monitoring**: Set up proper logging and monitoring
6. **SSL/TLS**: Configure HTTPS for production

This setup guide should get you up and running with GraphMarket development. For deployment instructions, see the [Deployment Guide](../deployment/deployment.md). 