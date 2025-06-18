import mongoose from 'mongoose';
import { logger } from '../src/utils/logging.js';

export default async function globalTeardown() {
  try {
    // Force close all mongoose connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      logger.info('✅ Mongoose connection closed in global teardown');
    }
    
    // Close all connections in the connection pool
    await mongoose.disconnect();
    
    // Force close any remaining connections
    if (mongoose.connections) {
      await Promise.all(
        mongoose.connections.map(async (connection) => {
          if (connection.readyState !== 0) {
            await connection.close();
          }
        })
      );
    }
    
    logger.info('✅ Global test teardown completed successfully');
  } catch (error) {
    logger.error('❌ Global teardown error:', error);
  }
} 