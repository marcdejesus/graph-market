import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Product } from '../src/models/Product.js';

// Load environment variables
dotenv.config();

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/graphmarket');
    console.log('Connected to MongoDB for seeding');

    // Clear existing data
    await User.deleteMany({});
    await Product.deleteMany({});
    console.log('Cleared existing data');

    // Create admin user
    const adminUser = await User.create({
      email: 'admin@graphmarket.com',
      password: 'admin123',
      role: 'admin',
      firstName: 'Admin',
      lastName: 'User'
    });

    // Create customer user
    const customerUser = await User.create({
      email: 'customer@example.com',
      password: 'customer123',
      role: 'customer',
      firstName: 'John',
      lastName: 'Doe'
    });

    console.log('Created users');

    // Create sample products
    const products = [
      {
        name: 'Wireless Bluetooth Headphones',
        description: 'High-quality wireless headphones with noise cancellation',
        category: 'Electronics',
        price: 199.99,
        stock: 50,
        imageUrl: 'https://example.com/headphones.jpg',
        createdBy: adminUser._id
      },
      {
        name: 'Organic Cotton T-Shirt',
        description: 'Comfortable organic cotton t-shirt in various colors',
        category: 'Clothing',
        price: 29.99,
        stock: 100,
        imageUrl: 'https://example.com/tshirt.jpg',
        createdBy: adminUser._id
      },
      {
        name: 'Smartphone Stand',
        description: 'Adjustable aluminum smartphone stand for desk use',
        category: 'Accessories',
        price: 24.99,
        stock: 75,
        imageUrl: 'https://example.com/stand.jpg',
        createdBy: adminUser._id
      },
      {
        name: 'Coffee Mug Set',
        description: 'Set of 4 ceramic coffee mugs with unique designs',
        category: 'Home & Kitchen',
        price: 39.99,
        stock: 30,
        imageUrl: 'https://example.com/mugs.jpg',
        createdBy: adminUser._id
      },
      {
        name: 'Yoga Mat',
        description: 'Non-slip yoga mat with carrying strap',
        category: 'Sports & Fitness',
        price: 49.99,
        stock: 25,
        imageUrl: 'https://example.com/yoga-mat.jpg',
        createdBy: adminUser._id
      }
    ];

    await Product.insertMany(products);
    console.log('Created sample products');

    console.log('\n✅ Database seeded successfully!');
    console.log('\nAdmin credentials:');
    console.log('Email: admin@graphmarket.com');
    console.log('Password: admin123');
    console.log('\nCustomer credentials:');
    console.log('Email: customer@example.com');
    console.log('Password: customer123');

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    process.exit(0);
  }
};

seedDatabase(); 