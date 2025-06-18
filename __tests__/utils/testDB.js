import mongoose from 'mongoose';

let isConnected = false;

export const ensureTestDBConnection = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return; // Already connected
  }

  try {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphmarket-test';
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 15000, // Give up after 15s
        socketTimeoutMS: 0, // Disable socket timeout
        connectTimeoutMS: 15000,
        maxPoolSize: 10,
        minPoolSize: 1,
      });
    }

    // Wait for connection to be ready
    await mongoose.connection.db.admin().ping();
    isConnected = true;
    console.log('✅ Test database connection verified');
  } catch (error) {
    console.error('🔴 Test database connection failed:', error.message);
    throw error;
  }
};

export const clearTestCollections = async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(
      collections.map(collection => collection.deleteMany({}))
    );
  }
};

export const closeTestDBConnection = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    
    // Also call disconnect to ensure cleanup
    await mongoose.disconnect();
    
    isConnected = false;
    console.log('✅ Test database connection closed');
  } catch (error) {
    console.warn('⚠️ Error closing test database connection:', error.message);
  }
}; 