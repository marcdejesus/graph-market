import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Product description cannot exceed 1000 characters']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative'],
    validate: {
      validator: function(value) {
        return Number.isFinite(value) && value >= 0;
      },
      message: 'Price must be a valid positive number'
    }
  },
  stock: {
    type: Number,
    default: 0,
    min: [0, 'Stock cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: 'Stock must be a whole number'
    }
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  imageUrl: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ isActive: 1 });
productSchema.index({ createdAt: -1 });

// Virtual for checking if product is in stock
productSchema.virtual('inStock').get(function() {
  return this.stock > 0;
});

// Pre-save middleware to generate SKU if not provided
productSchema.pre('save', function(next) {
  if (!this.sku && this.isNew) {
    this.sku = `${this.category.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }
  next();
});

export const Product = mongoose.model('Product', productSchema); 