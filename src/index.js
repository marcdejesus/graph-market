import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { connectDB } from './config/database.js';
import { connectRedis } from './config/redis.js';
import { typeDefs } from './schema/index.js';
import { resolvers } from './resolvers/index.js';
import { createContext } from './context/index.js';

// Load environment variables
dotenv.config();

async function startServer() {
  // Connect to databases
  await connectDB();
  await connectRedis();

  // Create Express app
  const app = express();
  const httpServer = http.createServer(app);

  // Create Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    introspection: process.env.NODE_ENV !== 'production',
    csrfPrevention: true,
  });

  await server.start();

  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: 'Too many requests from this IP, please try again later.',
  });

  app.use(limiter);

  // Apply GraphQL middleware
  app.use(
    '/graphql',
    cors({
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : true,
      credentials: true,
    }),
    express.json(),
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