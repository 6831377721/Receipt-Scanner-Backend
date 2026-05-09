// ==========================================
// backend/routes/receiptRoutes.js
// ==========================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const receiptController = require('../controllers/receiptController');
const authMiddleware = require('../middleware/authMiddleware');

// Configure Multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024  // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'), false);
    }
  }
});

// POST /api/receipts/upload - Upload and process receipt
router.post(
  '/upload', 
  authMiddleware, 
  upload.single('receiptImage'), 
  receiptController.processReceipt
);

// GET /api/receipts - Get all receipts for user
router.get('/', authMiddleware, receiptController.getReceipts);

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '❌ ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)'
      });
    }
    return res.status(400).json({
      success: false,
      message: `❌ เกิดข้อผิดพลาดในการอัปโหลด: ${error.message}`
    });
  }
  next(error);
});

module.exports = router;