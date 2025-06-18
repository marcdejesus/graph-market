import mongoose from 'mongoose';

// Global teardown function
export default async function globalTeardown() {
  console.log('Starting global test teardown...');

  try {
    // Close MongoDB connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    }

    // Close any remaining database connections
    await mongoose.disconnect();

    // Force close any hanging connections
    if (global.mongoServer) {
      await global.mongoServer.stop();
      console.log('MongoDB Memory Server stopped');
    }

    // Clean up any test files or resources
    if (process.env.NODE_ENV === 'test') {
      // Perform any additional cleanup here
      console.log('Test environment cleanup completed');
    }

  } catch (error) {
    console.error('Error during teardown:', error);
  }

  console.log('Global test teardown completed');
} 