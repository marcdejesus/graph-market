# API Usage Examples

This document provides practical examples of using the GraphMarket GraphQL API for common e-commerce scenarios.

## Table of Contents

- [Authentication Examples](#authentication-examples)
- [Product Browsing Examples](#product-browsing-examples)
- [Order Management Examples](#order-management-examples)
- [Admin Operations Examples](#admin-operations-examples)
- [Advanced Query Examples](#advanced-query-examples)
- [Error Handling Examples](#error-handling-examples)

## Authentication Examples

### User Registration

```graphql
mutation RegisterUser {
  signup(
    email: "customer@example.com"
    password: "SecurePassword123!"
    firstName: "John"
    lastName: "Doe"
  ) {
    token
    user {
      id
      email
      role
      fullName
      createdAt
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "signup": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "60d5ecb74f8c8b001f8b4567",
        "email": "customer@example.com",
        "role": "CUSTOMER",
        "fullName": "John Doe",
        "createdAt": "2023-06-25T10:30:00.000Z"
      }
    }
  }
}
```

### User Login

```graphql
mutation LoginUser {
  login(
    email: "customer@example.com"
    password: "SecurePassword123!"
  ) {
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

### Get Current User Profile

```graphql
query GetCurrentUser {
  me {
    id
    email
    role
    firstName
    lastName
    fullName
    isActive
    createdAt
  }
}
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Product Browsing Examples

### Browse All Products

```graphql
query GetAllProducts {
  products(first: 20) {
    edges {
      node {
        id
        name
        description
        category
        price
        stock
        inStock
        imageUrl
        createdBy {
          firstName
          lastName
        }
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}
```

### Filter Products by Category and Price

```graphql
query FilterProducts($filter: ProductFilterInput!) {
  products(filter: $filter, first: 10) {
    edges {
      node {
        id
        name
        category
        price
        inStock
        imageUrl
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
```

**Variables:**
```json
{
  "filter": {
    "category": "electronics",
    "minPrice": 100,
    "maxPrice": 500,
    "inStock": true
  }
}
```

### Search Products

```graphql
query SearchProducts($query: String!, $filter: ProductFilterInput) {
  searchProducts(query: $query, filter: $filter, first: 15) {
    edges {
      node {
        id
        name
        description
        category
        price
        inStock
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
```

**Variables:**
```json
{
  "query": "wireless headphones",
  "filter": {
    "category": "electronics",
    "inStock": true
  }
}
```

### Get Single Product Details

```graphql
query GetProductDetails($productId: ID!) {
  product(id: $productId) {
    id
    name
    description
    category
    price
    stock
    sku
    imageUrl
    inStock
    isActive
    createdBy {
      id
      firstName
      lastName
      email
    }
    createdAt
    updatedAt
  }
}
```

**Variables:**
```json
{
  "productId": "60d5ecb74f8c8b001f8b4567"
}
```

### Get Popular Products

```graphql
query GetPopularProducts {
  popularProducts(limit: 8) {
    id
    name
    category
    price
    imageUrl
    inStock
  }
}
```

### Get Product Categories with Analytics

```graphql
query GetProductCategories {
  productCategories {
    category
    productCount
    averagePrice
    totalStock
  }
}
```

## Order Management Examples

### Place an Order

```graphql
mutation PlaceOrder($orderInput: OrderInput!) {
  placeOrder(input: $orderInput) {
    id
    orderNumber
    totalAmount
    status
    paymentStatus
    items {
      product {
        id
        name
        price
      }
      quantity
      price
    }
    shippingAddress {
      street
      city
      state
      zipCode
      country
    }
    createdAt
  }
}
```

**Variables:**
```json
{
  "orderInput": {
    "items": [
      {
        "productId": "60d5ecb74f8c8b001f8b4567",
        "quantity": 2
      },
      {
        "productId": "60d5ecb74f8c8b001f8b4568",
        "quantity": 1
      }
    ],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    },
    "notes": "Please deliver during business hours"
  }
}
```

### Get Customer's Orders

```graphql
query GetMyOrders {
  myOrders {
    id
    orderNumber
    totalAmount
    status
    paymentStatus
    items {
      product {
        id
        name
        imageUrl
      }
      quantity
      price
    }
    createdAt
    updatedAt
  }
}
```

### Get Specific Order Details

```graphql
query GetOrderDetails($orderId: ID!) {
  order(id: $orderId) {
    id
    orderNumber
    totalAmount
    status
    paymentStatus
    items {
      product {
        id
        name
        description
        imageUrl
      }
      quantity
      price
    }
    shippingAddress {
      street
      city
      state
      zipCode
      country
    }
    notes
    user {
      id
      email
      fullName
    }
    createdAt
    updatedAt
  }
}
```

### Cancel an Order

```graphql
mutation CancelOrder($orderId: ID!) {
  cancelOrder(orderId: $orderId) {
    id
    orderNumber
    status
    updatedAt
  }
}
```

## Admin Operations Examples

### Add New Product

```graphql
mutation AddProduct($productInput: ProductInput!) {
  addProduct(input: $productInput) {
    id
    name
    description
    category
    price
    stock
    sku
    imageUrl
    isActive
    createdBy {
      id
      fullName
    }
    createdAt
  }
}
```

**Variables:**
```json
{
  "productInput": {
    "name": "Wireless Bluetooth Headphones",
    "description": "High-quality wireless headphones with noise cancellation",
    "category": "electronics",
    "price": 199.99,
    "stock": 50,
    "imageUrl": "https://example.com/images/headphones.jpg"
  }
}
```

### Update Product

```graphql
mutation UpdateProduct($productId: ID!, $updateInput: UpdateProductInput!) {
  updateProduct(id: $productId, input: $updateInput) {
    id
    name
    description
    price
    stock
    isActive
    updatedAt
  }
}
```

**Variables:**
```json
{
  "productId": "60d5ecb74f8c8b001f8b4567",
  "updateInput": {
    "price": 179.99,
    "stock": 75,
    "description": "Updated description with new features"
  }
}
```

### Delete Product

```graphql
mutation DeleteProduct($productId: ID!) {
  deleteProduct(id: $productId)
}
```

### Get All Users (Admin)

```graphql
query GetAllUsers($first: Int, $after: String) {
  users(first: $first, after: $after) {
    id
    email
    role
    firstName
    lastName
    isActive
    createdAt
  }
}
```

### Get All Orders (Admin)

```graphql
query GetAllOrders($status: OrderStatus, $first: Int, $after: String) {
  allOrders(status: $status, first: $first, after: $after) {
    id
    orderNumber
    totalAmount
    status
    paymentStatus
    user {
      id
      email
      fullName
    }
    items {
      product {
        name
      }
      quantity
      price
    }
    createdAt
  }
}
```

### Update Order Status

```graphql
mutation UpdateOrderStatus($orderId: ID!, $status: OrderStatus!) {
  updateOrderStatus(orderId: $orderId, status: $status) {
    id
    orderNumber
    status
    updatedAt
  }
}
```

**Variables:**
```json
{
  "orderId": "60d5ecb74f8c8b001f8b4569",
  "status": "SHIPPED"
}
```

### Get Order Statistics

```graphql
query GetOrderStats {
  orderStats {
    totalOrders
    totalRevenue
    averageOrderValue
    ordersByStatus {
      status
      count
    }
  }
}
```

### Update User Role

```graphql
mutation UpdateUserRole($userId: ID!, $role: Role!) {
  updateUserRole(userId: $userId, role: $role) {
    id
    email
    role
    updatedAt
  }
}
```

## Advanced Query Examples

### Complex Product Query with Pagination

```graphql
query ComplexProductQuery(
  $filter: ProductFilterInput!
  $first: Int!
  $after: String
) {
  products(filter: $filter, first: $first, after: $after) {
    edges {
      node {
        id
        name
        category
        price
        stock
        inStock
        imageUrl
        createdBy {
          firstName
          lastName
        }
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
  
  # Also get categories for filtering UI
  productCategories {
    category
    productCount
    averagePrice
  }
  
  # And popular products for recommendations
  popularProducts(limit: 5) {
    id
    name
    price
    imageUrl
  }
}
```

### Order History with Product Details

```graphql
query OrderHistoryWithDetails {
  myOrders {
    id
    orderNumber
    totalAmount
    status
    paymentStatus
    items {
      product {
        id
        name
        category
        imageUrl
        createdBy {
          firstName
          lastName
        }
      }
      quantity
      price
    }
    shippingAddress {
      street
      city
      state
      country
    }
    createdAt
    updatedAt
  }
}
```

### Admin Dashboard Query

```graphql
query AdminDashboard {
  # Order statistics
  orderStats {
    totalOrders
    totalRevenue
    averageOrderValue
    ordersByStatus {
      status
      count
    }
  }
  
  # Recent orders
  allOrders(first: 10) {
    id
    orderNumber
    totalAmount
    status
    user {
      email
      fullName
    }
    createdAt
  }
  
  # Product categories
  productCategories {
    category
    productCount
    averagePrice
    totalStock
  }
  
  # Recent users
  users(first: 5) {
    id
    email
    role
    createdAt
  }
}
```

## Error Handling Examples

### Handling Authentication Errors

```graphql
query GetCurrentUser {
  me {
    id
    email
    role
  }
}
```

**Error Response (No Token):**
```json
{
  "errors": [
    {
      "message": "Authentication required",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ],
  "data": {
    "me": null
  }
}
```

### Handling Validation Errors

```graphql
mutation InvalidSignup {
  signup(
    email: "invalid-email"
    password: "123"
    firstName: "John"
  ) {
    token
    user {
      id
      email
    }
  }
}
```

**Error Response:**
```json
{
  "errors": [
    {
      "message": "Invalid email format",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "field": "email"
      }
    },
    {
      "message": "Password must be at least 8 characters long",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "field": "password"
      }
    }
  ]
}
```

### Handling Not Found Errors

```graphql
query GetNonExistentProduct {
  product(id: "invalid-id") {
    id
    name
  }
}
```

**Error Response:**
```json
{
  "errors": [
    {
      "message": "Invalid ObjectId format",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "field": "id"
      }
    }
  ]
}
```

### Handling Permission Errors

```graphql
mutation UnauthorizedProductAdd {
  addProduct(input: {
    name: "Test Product"
    category: "test"
    price: 10.0
    stock: 1
  }) {
    id
    name
  }
}
```

**Error Response (Customer trying admin operation):**
```json
{
  "errors": [
    {
      "message": "Admin access required",
      "extensions": {
        "code": "FORBIDDEN"
      }
    }
  ]
}
```

## Client Integration Tips

### Using with Apollo Client (React)

```javascript
import { gql, useQuery, useMutation } from '@apollo/client';

const GET_PRODUCTS = gql`
  query GetProducts($filter: ProductFilterInput, $first: Int, $after: String) {
    products(filter: $filter, first: $first, after: $after) {
      edges {
        node {
          id
          name
          price
          category
          inStock
          imageUrl
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PLACE_ORDER = gql`
  mutation PlaceOrder($input: OrderInput!) {
    placeOrder(input: $input) {
      id
      orderNumber
      totalAmount
      status
    }
  }
`;

function ProductList() {
  const { loading, error, data, fetchMore } = useQuery(GET_PRODUCTS, {
    variables: { first: 20 }
  });
  
  const [placeOrder] = useMutation(PLACE_ORDER);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.products.edges.map(({ node }) => (
        <div key={node.id}>
          <h3>{node.name}</h3>
          <p>Price: ${node.price}</p>
          <p>Category: {node.category}</p>
          <p>In Stock: {node.inStock ? 'Yes' : 'No'}</p>
        </div>
      ))}
      
      {data.products.pageInfo.hasNextPage && (
        <button
          onClick={() =>
            fetchMore({
              variables: {
                after: data.products.pageInfo.endCursor,
              },
            })
          }
        >
          Load More
        </button>
      )}
    </div>
  );
}
```

### Setting Up Authentication Headers

```javascript
import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const httpLink = createHttpLink({
  uri: 'http://localhost:4000/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    }
  }
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache()
});
```

This comprehensive set of examples covers all major use cases for the GraphMarket API, from basic product browsing to complex admin operations, with proper error handling and client integration examples. 