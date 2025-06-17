import gql from 'graphql-tag';

export const typeDefs = gql`
  # Scalar types
  scalar Date

  # User types
  type User {
    id: ID!
    email: String!
    role: Role!
    firstName: String
    lastName: String
    fullName: String
    isActive: Boolean!
    createdAt: Date!
    updatedAt: Date!
  }

  enum Role {
    CUSTOMER
    ADMIN
  }

  # Product types
  type Product {
    id: ID!
    name: String!
    description: String
    category: String!
    price: Float!
    stock: Int!
    sku: String
    imageUrl: String
    isActive: Boolean!
    inStock: Boolean!
    createdBy: User!
    createdAt: Date!
    updatedAt: Date!
  }

  # Order types
  type Order {
    id: ID!
    user: User!
    items: [OrderItem!]!
    totalAmount: Float!
    status: OrderStatus!
    orderNumber: String!
    shippingAddress: ShippingAddress
    paymentStatus: PaymentStatus!
    notes: String
    createdAt: Date!
    updatedAt: Date!
  }

  type OrderItem {
    product: Product!
    quantity: Int!
    price: Float!
  }

  type ShippingAddress {
    street: String
    city: String
    state: String
    zipCode: String
    country: String
  }

  enum OrderStatus {
    PENDING
    CONFIRMED
    PROCESSING
    SHIPPED
    DELIVERED
    CANCELLED
  }

  enum PaymentStatus {
    PENDING
    PAID
    FAILED
    REFUNDED
  }

  # Auth types
  type AuthPayload {
    token: String!
    user: User!
  }

  # Input types
  input ProductFilterInput {
    category: String
    minPrice: Float
    maxPrice: Float
    inStock: Boolean
    search: String
  }

  input ProductInput {
    name: String!
    description: String
    category: String!
    price: Float!
    stock: Int!
    imageUrl: String
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
  }

  input OrderInput {
    items: [OrderItemInput!]!
    shippingAddress: ShippingAddressInput
    notes: String
  }

  input ShippingAddressInput {
    street: String!
    city: String!
    state: String!
    zipCode: String!
    country: String!
  }

  input UpdateProductInput {
    name: String
    description: String
    category: String
    price: Float
    stock: Int
    imageUrl: String
    isActive: Boolean
  }

  # Pagination types
  type ProductConnection {
    edges: [ProductEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type ProductEdge {
    node: Product!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # Product Category type
  type ProductCategory {
    category: String!
    productCount: Int!
    averagePrice: Float!
    totalStock: Int!
  }

  # Query type
  type Query {
    # Public queries
    products(
      filter: ProductFilterInput
      first: Int = 20
      after: String
    ): ProductConnection!
    
    product(id: ID!): Product
    
    # Advanced product queries
    popularProducts(limit: Int = 10): [Product!]!
    productCategories: [ProductCategory!]!
    searchProducts(
      query: String!
      filter: ProductFilterInput
      first: Int = 20
      after: String
    ): ProductConnection!
    
    # Authenticated queries
    me: User
    
    # Customer queries
    myOrders: [Order!]!
    order(id: ID!): Order
    
    # Admin queries
    users(first: Int = 20, after: String): [User!]!
    allOrders(
      status: OrderStatus
      first: Int = 20
      after: String
    ): [Order!]!
    
    # Analytics (Admin only)
    orderStats: OrderStats!
  }

  type OrderStats {
    totalOrders: Int!
    totalRevenue: Float!
    averageOrderValue: Float!
    ordersByStatus: [StatusCount!]!
  }

  type StatusCount {
    status: OrderStatus!
    count: Int!
  }

  # Mutation type
  type Mutation {
    # Authentication
    signup(email: String!, password: String!, firstName: String, lastName: String): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    
    # Customer mutations
    placeOrder(input: OrderInput!): Order!
    cancelOrder(orderId: ID!): Order!
    
    # Admin mutations
    addProduct(input: ProductInput!): Product!
    updateProduct(id: ID!, input: UpdateProductInput!): Product!
    deleteProduct(id: ID!): Boolean!
    
    updateOrderStatus(orderId: ID!, status: OrderStatus!): Order!
    
    # User management (Admin only)
    updateUserRole(userId: ID!, role: Role!): User!
    deactivateUser(userId: ID!): User!
  }

  # Subscription type (for future implementation)
  type Subscription {
    orderStatusUpdated(userId: ID): Order!
    newOrder: Order!
  }
`; 