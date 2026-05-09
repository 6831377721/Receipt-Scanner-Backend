// ==========================================
// backend/middleware/authMiddleware.js
// ==========================================
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'ไม่พบ Token: กรุณาเข้าสู่ระบบก่อนใช้งาน' 
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to request
    req.user = { 
      userId: decoded.userId 
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token หมดอายุ: กรุณาเข้าสู่ระบบใหม่' 
      });
    }
    
    return res.status(401).json({ 
      success: false,
      message: 'Token ไม่ถูกต้อง: กรุณาตรวจสอบและลองใหม่' 
    });
  }
};

module.exports = authMiddleware;