// ==========================================
// backend/controllers/authController.js
// ==========================================
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Register new user
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      const field = existingUser.email === email ? 'อีเมล' : 'ชื่อผู้ใช้';
      return res.status(400).json({ 
        success: false,
        message: `${field}นี้มีผู้ใช้งานแล้ว` 
      });
    }

    // Create new user
    const newUser = new User({ username, email, password });
    await newUser.save();

    res.status(201).json({ 
      success: true,
      message: '🎉 สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ' 
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: messages.join(', ') 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'เกิดข้อผิดพลาดที่ Server กรุณาลองใหม่ภายหลัง' 
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'กรุณากรอกอีเมลและรหัสผ่าน' 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: '❌ ไม่พบบัญชีผู้ใช้นี้ในระบบ' 
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: '❌ รหัสผ่านไม่ถูกต้อง' 
      });
    }

    // Generate JWT token (valid for 1 day)
    const token = jwt.sign(
      { userId: user._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1d' }
    );

    res.status(200).json({
      success: true,
      message: '✅ เข้าสู่ระบบสำเร็จ',
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email 
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'เกิดข้อผิดพลาดที่ Server กรุณาลองใหม่ภายหลัง' 
    });
  }
};