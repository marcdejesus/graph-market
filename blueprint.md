# Blueprint: GraphMarket – Headless E-Commerce API

## 🚀 Application Overview

* **Application Name:** GraphMarket
* **Technology:** Node.js, Apollo Server (GraphQL), MongoDB
* **Platform:** Headless API
* **Description:** A GraphQL-powered backend for a minimalist e-commerce platform. It is designed to simulate a real-world backend service that can power websites, mobile apps, and admin dashboards through a single, unified API, showcasing a strong understanding of modern API architecture.

## 🧩 Key Features

* **GraphQL First:** API designed entirely around a GraphQL schema.
* **User Management:** User accounts with distinct roles (customer vs. admin).
* **Product Catalog:** Products with rich details and advanced filtering capabilities (by name, category, price range).
* **Order Processing:** Multi-item orders tied to users with status tracking (`pending`, `shipped`, `delivered`).
* **Secure Authentication:** JWT-based auth flow for `signup` and `login` mutations.
* **Role-Based Access Control:** Middleware to protect specific queries and mutations based on user roles (e.g., only admins can add products).
* **Performance Caching:** Optional Redis integration for caching frequently requested data.
* **Automated Documentation:** Interactive API documentation provided by GraphQL Playground.

## 🔧 Technical Architecture

* **Core Framework:** **Node.js** with **Apollo Server** for handling GraphQL requests efficiently.
* **Database:** **MongoDB** with **Mongoose** for flexible, schema-based data modeling.
* **Authentication:** Self-managed **JSON Web Tokens (JWT)** for stateless session management.
* **Caching Layer:** **Redis** to reduce database load on common queries (e.g., `products`).
* **Development & Deployment:** **Dockerized** services (Node API, MongoDB, Redis) managed via **Docker Compose** for a consistent development environment. Environment configuration handled through `.env` files.

## 🧬 Core Data Models (Mongoose Schemas)

* **User:**
    * `email`: { type: String, required: true, unique: true }
    * `password`: { type: String, required: true }
    * `role`: { type: String, enum: ['customer', 'admin'], default: 'customer' }
* **Product:**
    * `name`: { type: String, required: true }
    * `description`: { type: String }
    * `category`: { type: String, required: true, index: true }
    * `price`: { type: Number, required: true, min: 0 }
    * `stock`: { type: Number, default: 0 }
* **Order:**
    * `user`: { type: Schema.Types.ObjectId, ref: 'User' }
    * `products`: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, quantity: Number }]
    * `totalAmount`: { type: Number, required: true }
    * `status`: { type: String, enum: ['pending', 'shipped', 'delivered', 'cancelled'], default: 'pending' }
    * `createdAt`: { type: Date, default: Date.now }

## 🕸️ GraphQL Schema (Sample Operations)

* **Queries:**
    * `products(filter: ProductFilterInput, skip: Int, limit: Int): [Product!]`
    * `product(id: ID!): Product`
    * `me: User` (Requires authentication)
    * `orders: [Order!]` (Requires authentication; admins see all, customers see their own)
* **Mutations:**
    * `signup(email: String!, password: String!): AuthPayload!`
    * `login(email: String!, password: String!): AuthPayload!`
    * `addProduct(input: ProductInput!): Product!` (Admin only)
    * `placeOrder(input: OrderInput!): Order!` (Customer only)
    * `updateOrderStatus(orderId: ID!, status: String!): Order!` (Admin only)

* **Types:**
    * `AuthPayload` would contain the user and the JWT token.

## ⚙️ Workflow & Logic

1.  **Authentication:** A client calls `signup` or `login` to receive a JWT. This token is then passed in the `Authorization` header for all subsequent protected requests.
2.  **Product Browse:** Any client can query `products` with filters for price or category.
3.  **Placing an Order:** An authenticated `customer` calls the `placeOrder` mutation, providing product IDs and quantities. The resolver calculates the total and creates the order document.
4.  **Admin Management:** An authenticated `admin` user can call mutations like `addProduct` or use the `updateOrderStatus` mutation to manage the lifecycle of an order. The API middleware will reject these calls if the user's token does not contain the 'admin' role.

## 🧪 DevOps & Testing

* **Local Environment:** `docker-compose.yml` spins up the Node.js API, a MongoDB instance, and a Redis instance.
* **Testing:** **Jest** is used for unit and integration tests. Resolvers are tested with mocked context (user roles, database models) to ensure business logic is correct.
* **CI/CD:** **GitHub Actions** workflow to run Jest tests automatically on every push and pull request to the `main` branch.
* **Security:** Middleware implements role-based access. **Rate limiting** is applied to sensitive mutations like `login` to prevent brute-force attacks.

## 🔮 Future Enhancements

* **GraphQL Subscriptions:** Implement real-time order status updates for clients.
* **Payment Gateway Integration:** Add mutations to handle payments via Stripe.
* **Product Reviews:** Add types and resolvers for users to review products.
* **Data Analytics:** Create admin-only queries to aggregate sales data.
* **Federated Schema:** Prepare the architecture to be split into microservices using Apollo Federation.

## ⭐ Strategic Purpose

This project is designed to:

* Demonstrate mastery of modern backend development with **GraphQL** and **Node.js**.
* Showcase best practices in **API design**, including security, performance, and scalability.
* Serve as a robust, plug-and-play backend that can be integrated into any frontend (Web, Mobile), making it an excellent portfolio centerpiece.
* Reflect the real-world architecture of modern e-commerce platforms.