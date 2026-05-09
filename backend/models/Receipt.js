// ==========================================
// backend/models/Receipt.js
// ==========================================
const mongoose = require('mongoose');

// Line item schema
const lineItemSchema = new mongoose.Schema({
  description: { 
    type: String, 
    required: [true, 'Item description is required'],
    trim: true
  },
  quantity: { 
    type: Number, 
    default: 1,
    min: [1, 'Quantity must be at least 1']
  },
  amount: { 
    type: Number, 
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  category: { 
    type: String, 
    default: 'General',
    enum: ['Food', 'Shopping', 'Transport', 'Entertainment', 'Healthcare', 'Utilities', 'Other', 'General']
  }
});

// Receipt schema
const receiptSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'],
    index: true
  },
  merchantName: { 
    type: String, 
    required: [true, 'Merchant name is required'], 
    trim: true 
  },
  totalAmount: { 
    type: Number, 
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  receiptDate: { 
    type: Date, 
    default: Date.now 
  },
  lineItems: [lineItemSchema],
  mainCategory: { 
    type: String, 
    default: 'Other',
    enum: ['Food', 'Shopping', 'Transport', 'Entertainment', 'Healthcare', 'Utilities', 'Other']
  },
  imageUrl: { 
    type: String 
  }
}, { 
  timestamps: true 
});

// Index for faster queries
receiptSchema.index({ userId: 1, receiptDate: -1 });
receiptSchema.index({ userId: 1, mainCategory: 1 });

module.exports = mongoose.model('Receipt', receiptSchema);