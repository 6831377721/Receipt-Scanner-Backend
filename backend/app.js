// ==========================================
// backend/server.js
// ==========================================
const express = require('express'); 
const cors = require('cors');
const connectDB = require("./config/db");

require('dotenv').config(); 

const app = express(); 
const PORT = process.env.PORT || 5000; 

connectDB();

// ==========================================
// Middleware
// ==========================================
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// ==========================================
// Routes
// ==========================================
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Welcome to Receipt Scanner API!',
    version: '1.0.0',
    status: 'running'
  });
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const receiptRoutes = require('./routes/receiptRoutes');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/receipts', receiptRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ 
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;