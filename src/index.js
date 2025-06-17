import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { connectDB } from './config/database.js';
import { connectRedis } from './config/redis.js';
import { typeDefs } from './schema/index.js';
import { resolvers } from './resolvers/index.js';
import { createContext } from './context/index.js';
import { generalLimiter, createGraphQLRateLimiter } from './middleware/rateLimiting.js';
import { requestLogger, requestIdMiddleware } from './utils/logging.js';

// Load environment variables
dotenv.config();

async function startServer() {
  // Connect to databases
  await connectDB();
  await connectRedis();

  // Create Express app
  const app = express();
  const httpServer = http.createServer(app);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
    hsts: process.env.NODE_ENV === 'production',
  }));

  // Request tracking and logging
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  // Trust proxy for rate limiting (if behind a proxy)
  app.set('trust proxy', 1);

  // General rate limiting
  app.use(generalLimiter);

  // Create Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    introspection: process.env.NODE_ENV !== 'production',
    csrfPrevention: true,
    formatError: (error) => {
      // Log GraphQL errors
      console.error('GraphQL Error:', error);
      
      // Don't expose internal errors in production
      if (process.env.NODE_ENV === 'production') {
        return new Error('Internal server error');
      }
      
      return error;
    },
  });

  await server.start();

  // Enhanced GraphQL rate limiting specifically for auth operations
  const graphqlRateLimiter = createGraphQLRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // General GraphQL operations
    authMax: 5, // Authentication operations
    authOperations: ['signup', 'login']
  });

  // Apply GraphQL middleware with enhanced security
  app.use(
    '/graphql',
    graphqlRateLimiter,
    cors({
      origin: process.env.NODE_ENV === 'production' 
        ? (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : false)
        : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 86400, // 24 hours
    }),
    express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        // Basic request body validation
        if (buf.length > 10 * 1024 * 1024) { // 10MB limit
          throw new Error('Request body too large');
        }
      }
    }),
    expressMiddleware(server, {
      context: createContext,
    })
  );

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV 
    });
  });

  const PORT = process.env.PORT || 4000;

  await new Promise((resolve) => httpServer.listen({ port: PORT }, resolve));
  
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
  console.log(`🏥 Health check available at http://localhost:${PORT}/health`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});

startServer().catch((error) => {
  console.error('Error starting server:', error);
  process.exit(1);
}); 