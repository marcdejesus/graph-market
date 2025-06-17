import mongoose from 'mongoose';

const connectWithRetry = async (mongoUri, retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 10000, // Give up after 10s
        });
        console.log('✅ Test database connected successfully');
        
        // Ping the database to ensure it's ready
        await mongoose.connection.db.admin().ping();
        console.log('✅ Database ping successful');
        return;
      }
    } catch (error) {
      console.warn(`⚠️ Test database connection attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error('🔴 Could not connect to test database after multiple retries.');
        throw error;
      }
    }
  }
};

export default async function globalSetup() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphmarket-test';
    await connectWithRetry(mongoUri);
  } catch (error) {
    console.error('⚠️ Global setup failed:', error.message);
    process.exit(1);
  }
} 