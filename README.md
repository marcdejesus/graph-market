# GraphMarket - Headless E-Commerce API

A modern, GraphQL-powered headless e-commerce API built with Node.js, Apollo Server, and MongoDB. Designed to power websites, mobile apps, and admin dashboards through a unified API.

## 🚀 Features

- **GraphQL First**: Complete API built around GraphQL with Apollo Server
- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Product Management**: Full CRUD operations with advanced filtering and search
- **Order Processing**: Complete order lifecycle management with inventory tracking
- **Caching**: Redis integration for optimal performance
- **Enterprise Security**: Multi-level rate limiting, input sanitization, comprehensive logging, CORS protection
- **Containerized**: Full Docker setup for easy development and deployment

## 🛠️ Tech Stack

- **Backend**: Node.js with Apollo Server (GraphQL)
- **Database**: MongoDB with Mongoose ODM
- **Caching**: Redis
- **Authentication**: JSON Web Tokens (JWT)
- **Container**: Docker & Docker Compose
- **Testing**: Jest

## 📋 Prerequisites

- Node.js 18+ (if running locally)
- Docker & Docker Compose (recommended)
- MongoDB (included in Docker setup)
- Redis (included in Docker setup)

## 🚀 Quick Start

### Using Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd graph-market
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

3. **Start all services**
   ```bash
   npm run docker:up
   ```

4. **Seed the database**
   ```bash
   npm run seed
   ```

5. **Access the API**
   - GraphQL Playground: http://localhost:4000/graphql
   - Health Check: http://localhost:4000/health

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start MongoDB and Redis** (ensure they're running locally)

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Configure your local database URLs
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## 📊 API Overview

### Authentication Endpoints

```graphql
# Signup
mutation Signup {
  signup(email: "user@example.com", password: "password123", firstName: "John", lastName: "Doe") {
    token
    user {
      id
      email
      role
    }
  }
}

# Login
mutation Login {
  login(email: "user@example.com", password: "password123") {
    token
    user {
      id
      email
      role
    }
  }
}
```

### Product Operations

```graphql
# Get Products with filtering
query GetProducts {
  products(filter: { category: "Electronics", minPrice: 50, maxPrice: 500 }, first: 10) {
    edges {
      node {
        id
        name
        price
        category
        stock
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Add Product (Admin only)
mutation AddProduct {
  addProduct(input: {
    name: "New Product"
    description: "Product description"
    category: "Electronics"
    price: 99.99
    stock: 10
  }) {
    id
    name
    price
  }
}
```

### Order Management

```graphql
# Place Order
mutation PlaceOrder {
  placeOrder(input: {
    items: [
      { productId: "PRODUCT_ID", quantity: 2 }
    ]
    shippingAddress: {
      street: "123 Main St"
      city: "New York"
      state: "NY"
      zipCode: "10001"
      country: "USA"
    }
  }) {
    id
    totalAmount
    status
    orderNumber
  }
}

# Get My Orders
query MyOrders {
  myOrders {
    id
    orderNumber
    totalAmount
    status
    createdAt
    items {
      product {
        name
        price
      }
      quantity
    }
  }
}
```

## 🔐 Authentication

Include the JWT token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

### User Roles

- **Customer**: Can browse products, place orders, view their own orders
- **Admin**: Full access to all operations including user management and analytics

## 🔒 Security Features

### Input Sanitization
- **XSS Protection**: Removes malicious scripts and event handlers
- **SQL Injection Prevention**: Validates against injection patterns
- **Email Sanitization**: RFC-compliant email validation and normalization
- **Name Validation**: Allows only safe characters and patterns

### Rate Limiting
- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 auth attempts per 15 minutes per IP
- **GraphQL-Aware**: Operation-specific rate limiting
- **Progressive Delays**: Exponential backoff for repeated violations

### Security Logging
```bash
# Real-time security event tracking
Authentication attempts (success/failure)
Rate limit violations
Suspicious activity detection
Input validation failures
```

### Production Security Headers
- Content Security Policy
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

### CORS Configuration
- Environment-specific origin whitelisting
- Credential-aware request handling
- Method and header restrictions

## 🗄️ Database Schema

### Users
- Email (unique)
- Password (hashed)
- Role (customer/admin)
- Personal information
- Account status

### Products
- Name, description, category
- Price and stock information
- SKU and image URL
- Creator reference
- Active status

### Orders
- User reference
- Order items with product references
- Total amount and status
- Shipping information
- Payment status

## 🐳 Docker Commands

```bash
# Start all services
npm run docker:up

# Stop all services
npm run docker:down

# View logs
npm run docker:logs

# Rebuild containers
docker-compose up --build
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --testPathPattern=user
```

## 📈 Performance & Monitoring

### Caching Strategy
- Product listings cached for 1 hour
- Individual products cached for 30 minutes
- User profiles cached for 15 minutes

### Rate Limiting
- 100 requests per 15 minutes per IP
- Special limits on authentication endpoints

### Health Check
Monitor API health at `/health` endpoint

## 🔧 Configuration

### Environment Variables

```bash
# Server
NODE_ENV=development
PORT=4000

# Database
MONGODB_URI=mongodb://localhost:27017/graphmarket
REDIS_URI=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📚 API Documentation

Access the interactive GraphQL Playground at `http://localhost:4000/graphql` to:
- Explore the complete schema
- Test queries and mutations
- View documentation for all types and fields

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```bash
   # Set production environment variables
   NODE_ENV=production
   MONGODB_URI=your-production-mongodb-uri
   REDIS_URI=your-production-redis-uri
   JWT_SECRET=your-production-jwt-secret
   ```

2. **Build and Deploy**
   ```bash
   # Build Docker image
   docker build -t graphmarket:latest .
   
   # Deploy with docker-compose
   docker-compose -f docker-compose.prod.yml up -d
   ```

### CI/CD Pipeline

The project includes GitHub Actions workflow for:
- Automated testing on pull requests
- Docker image building
- Security vulnerability scanning

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For questions and support:
- Check the [Implementation Strategy](IMPLEMENTATION_STRATEGY.md) for detailed technical information
- Open an issue for bugs or feature requests
- Review the GraphQL schema documentation in the playground

## 🗺️ Roadmap

See [IMPLEMENTATION_STRATEGY.md](IMPLEMENTATION_STRATEGY.md) for the complete development roadmap and feature implementation plan. 