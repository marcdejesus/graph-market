import mongoose from 'mongoose';

export default async function globalTeardown() {
  try {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('✅ Test database disconnected successfully');
  } catch (error) {
    console.error('⚠️ Error during test database teardown:', error.message);
    // Exit with an error code if teardown fails, to alert CI
    process.exit(1);
  }
} 