import mongoose from 'mongoose';

export default async function globalSetup() {
  try {
    // Use CI database URL if in CI, otherwise use local test database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphmarket-test';
    
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('✅ Test database connected successfully');
    }
  } catch (error) {
    console.warn('⚠️ Test database connection failed:', error.message);
    // Don't fail completely - tests should handle missing DB gracefully
  }
} 