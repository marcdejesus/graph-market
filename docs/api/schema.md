# GraphQL Schema Reference

This document provides a comprehensive reference for the GraphMarket GraphQL API schema.

## Table of Contents

- [Authentication](#authentication)
- [Core Types](#core-types)
- [Queries](#queries)
- [Mutations](#mutations)
- [Input Types](#input-types)
- [Enums](#enums)
- [Pagination](#pagination)

## Authentication

GraphMarket uses JWT (JSON Web Token) authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### Roles
- **CUSTOMER**: Can view products, place orders, manage their own orders
- **ADMIN**: Full access including product management, user management, and analytics

## Core Types

### User
Represents a user in the system (customer or admin).

```graphql
type User {
  id: ID!              # Unique user identifier
  email: String!       # User's email address (unique)
  role: Role!          # User role (CUSTOMER or ADMIN)
  firstName: String    # Optional first name
  lastName: String     # Optional last name
  fullName: String     # Computed full name (firstName + lastName)
  isActive: Boolean!   # Whether the user account is active
  createdAt: Date!     # Account creation timestamp
  updatedAt: Date!     # Last update timestamp
}
```

### Product
Represents a product in the catalog.

```graphql
type Product {
  id: ID!              # Unique product identifier
  name: String!        # Product name
  description: String  # Product description
  category: String!    # Product category
  price: Float!        # Product price
  stock: Int!          # Available inventory
  sku: String          # Stock Keeping Unit (auto-generated)
  imageUrl: String     # Product image URL
  isActive: Boolean!   # Whether product is active/visible
  inStock: Boolean!    # Computed: stock > 0
  createdBy: User!     # Admin who created the product
  createdAt: Date!     # Creation timestamp
  updatedAt: Date!     # Last update timestamp
}
```

### Order
Represents a customer order.

```graphql
type Order {
  id: ID!                        # Unique order identifier
  user: User!                    # Customer who placed the order
  items: [OrderItem!]!           # List of ordered items
  totalAmount: Float!            # Total order amount
  status: OrderStatus!           # Current order status
  orderNumber: String!           # Human-readable order number
  shippingAddress: ShippingAddress # Shipping address
  paymentStatus: PaymentStatus!  # Payment status
  notes: String                  # Optional order notes
  createdAt: Date!              # Order creation timestamp
  updatedAt: Date!              # Last update timestamp
}
```

### OrderItem
Represents an individual item within an order.

```graphql
type OrderItem {
  product: Product!    # The ordered product
  quantity: Int!       # Quantity ordered
  price: Float!        # Price at time of order
}
```

## Queries

### Public Queries (No Authentication Required)

#### products
Get a paginated list of products with optional filtering.

```graphql
products(
  filter: ProductFilterInput
  first: Int = 20
  after: String
): ProductConnection!
```

**Example:**
```graphql
query GetProducts($filter: ProductFilterInput, $first: Int, $after: String) {
  products(filter: $filter, first: $first, after: $after) {
    edges {
      node {
        id
        name
        price
        category
        inStock
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
```

#### product
Get a single product by ID.

```graphql
product(id: ID!): Product
```

**Example:**
```graphql
query GetProduct($id: ID!) {
  product(id: $id) {
    id
    name
    description
    price
    stock
    category
    imageUrl
    createdBy {
      firstName
      lastName
    }
  }
}
```

#### popularProducts
Get the most frequently queried products.

```graphql
popularProducts(limit: Int = 10): [Product!]!
```

#### productCategories
Get product category analytics.

```graphql
productCategories: [ProductCategory!]!
```

Returns:
```graphql
type ProductCategory {
  category: String!      # Category name
  productCount: Int!     # Number of products in category
  averagePrice: Float!   # Average price in category
  totalStock: Int!       # Total stock in category
}
```

#### searchProducts
Search products by text query with optional filtering.

```graphql
searchProducts(
  query: String!
  filter: ProductFilterInput
  first: Int = 20
  after: String
): ProductConnection!
```

### Authenticated Queries

#### me
Get current user information (requires authentication).

```graphql
me: User
```

### Customer Queries

#### myOrders
Get current user's orders (customer only).

```graphql
myOrders: [Order!]!
```

#### order
Get a specific order by ID (customer can only access their own orders).

```graphql
order(id: ID!): Order
```

### Admin Queries

#### users
Get paginated list of users (admin only).

```graphql
users(first: Int = 20, after: String): [User!]!
```

#### allOrders
Get all orders with optional filtering (admin only).

```graphql
allOrders(
  status: OrderStatus
  first: Int = 20
  after: String
): [Order!]!
```

#### orderStats
Get order analytics (admin only).

```graphql
orderStats: OrderStats!
```

Returns:
```graphql
type OrderStats {
  totalOrders: Int!
  totalRevenue: Float!
  averageOrderValue: Float!
  ordersByStatus: [StatusCount!]!
}
```

## Mutations

### Authentication

#### signup
Create a new user account.

```graphql
signup(
  email: String!
  password: String!
  firstName: String
  lastName: String
): AuthPayload!
```

**Example:**
```graphql
mutation Signup($email: String!, $password: String!, $firstName: String, $lastName: String) {
  signup(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {
    token
    user {
      id
      email
      role
      fullName
    }
  }
}
```

#### login
Authenticate and get a JWT token.

```graphql
login(email: String!, password: String!): AuthPayload!
```

### Customer Mutations

#### placeOrder
Place a new order (customer only).

```graphql
placeOrder(input: OrderInput!): Order!
```

**Example:**
```graphql
mutation PlaceOrder($input: OrderInput!) {
  placeOrder(input: $input) {
    id
    orderNumber
    totalAmount
    status
    items {
      product {
        name
      }
      quantity
      price
    }
  }
}
```

#### cancelOrder
Cancel an existing order (customer only, must be own order).

```graphql
cancelOrder(orderId: ID!): Order!
```

### Admin Mutations

#### addProduct
Add a new product (admin only).

```graphql
addProduct(input: ProductInput!): Product!
```

#### updateProduct
Update an existing product (admin only).

```graphql
updateProduct(id: ID!, input: UpdateProductInput!): Product!
```

#### deleteProduct
Soft delete a product (admin only).

```graphql
deleteProduct(id: ID!): Boolean!
```

#### updateOrderStatus
Update order status (admin only).

```graphql
updateOrderStatus(orderId: ID!, status: OrderStatus!): Order!
```

#### updateUserRole
Update user role (admin only).

```graphql
updateUserRole(userId: ID!, role: Role!): User!
```

## Input Types

### ProductFilterInput
Filter options for product queries.

```graphql
input ProductFilterInput {
  category: String      # Filter by category
  minPrice: Float      # Minimum price
  maxPrice: Float      # Maximum price
  inStock: Boolean     # Filter by stock availability
  search: String       # Text search in name/description
}
```

### ProductInput
Input for creating new products.

```graphql
input ProductInput {
  name: String!        # Product name (required)
  description: String  # Product description
  category: String!    # Product category (required)
  price: Float!        # Product price (required)
  stock: Int!          # Initial stock (required)
  imageUrl: String     # Product image URL
}
```

### OrderInput
Input for placing orders.

```graphql
input OrderInput {
  items: [OrderItemInput!]!          # Order items (required)
  shippingAddress: ShippingAddressInput # Shipping address
  notes: String                      # Optional notes
}
```

### OrderItemInput
Input for individual order items.

```graphql
input OrderItemInput {
  productId: ID!       # Product ID (required)
  quantity: Int!       # Quantity (required, > 0)
}
```

## Enums

### Role
User roles in the system.

```graphql
enum Role {
  CUSTOMER             # Regular customer
  ADMIN               # Administrator
}
```

### OrderStatus
Order status values.

```graphql
enum OrderStatus {
  PENDING             # Order placed, awaiting confirmation
  CONFIRMED           # Order confirmed
  PROCESSING          # Order being processed
  SHIPPED             # Order shipped
  DELIVERED           # Order delivered
  CANCELLED           # Order cancelled
}
```

### PaymentStatus
Payment status values.

```graphql
enum PaymentStatus {
  PENDING             # Payment pending
  PAID                # Payment completed
  FAILED              # Payment failed
  REFUNDED            # Payment refunded
}
```

## Pagination

GraphMarket uses cursor-based pagination for scalable results.

### ProductConnection
Paginated product results.

```graphql
type ProductConnection {
  edges: [ProductEdge!]!      # Product edges
  pageInfo: PageInfo!         # Pagination info
  totalCount: Int!            # Total number of products
}

type ProductEdge {
  node: Product!              # The product
  cursor: String!             # Cursor for this product
}

type PageInfo {
  hasNextPage: Boolean!       # More results available
  hasPreviousPage: Boolean!   # Previous results available
  startCursor: String         # First cursor in this page
  endCursor: String           # Last cursor in this page
}
```

### Usage Example
```graphql
query GetProductsWithPagination($first: Int, $after: String) {
  products(first: $first, after: $after) {
    edges {
      node {
        id
        name
        price
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Error Handling

GraphMarket returns standard GraphQL errors with additional context:

```json
{
  "errors": [
    {
      "message": "Product not found",
      "extensions": {
        "code": "NOT_FOUND",
        "field": "product"
      }
    }
  ]
}
```

Common error codes:
- `UNAUTHENTICATED`: Authentication required
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Input validation failed
- `INTERNAL_ERROR`: Server error

## Rate Limiting

- General queries: 100 requests per 15 minutes
- Authentication operations: 5 attempts per 15 minutes
- Complex queries are subject to additional complexity-based limiting

## Caching

GraphMarket implements intelligent caching:
- Product queries are cached for 5 minutes
- User profiles are cached for 1 hour
- Search results are cached for 2 minutes
- Cache is automatically invalidated on relevant mutations 