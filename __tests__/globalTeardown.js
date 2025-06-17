import mongoose from 'mongoose';

export default async function globalTeardown() {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('✅ Test database disconnected successfully');
    }
  } catch (error) {
    console.warn('⚠️ Error during test database teardown:', error.message);
  }
  
  // Force exit to prevent hanging
  setTimeout(() => {
    process.exit(0);
  }, 1000);
} 