// ==========================================
// backend/controllers/receiptController.js (FINAL PRODUCTION VERSION)
// ==========================================
const Receipt = require('../models/Receipt');
const axios = require('axios');
const sharp = require('sharp');

class ReceiptController {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1';
    
    // Model priority list (best to worst)
    this.modelPriority = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
    ];
    
    this.activeModel = null;
    
    console.log('🤖 Receipt Controller initialized');
  }

  /**
   * Auto-detect and cache working model
   */
  async getWorkingModel() {
    if (this.activeModel) return this.activeModel;
    
    console.log('🔍 Detecting best available Gemini model...');
    
    for (const modelName of this.modelPriority) {
      try {
        const testUrl = `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`;
        
        const response = await axios.post(testUrl, {
          contents: [{ parts: [{ text: "Ping" }] }]
        }, { timeout: 5000 });
        
        if (response.data.candidates) {
          this.activeModel = modelName;
          console.log(`✅ Using model: ${modelName}`);
          return modelName;
        }
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`   ⏭️ ${modelName} - not available`);
        } else if (error.response?.status === 403) {
          console.log(`   ⚠️ ${modelName} - permission denied`);
        } else {
          console.log(`   ❌ ${modelName} - ${error.message.substring(0, 100)}`);
        }
        continue;
      }
    }
    
    throw new Error('❌ No Gemini models available. Check your API key.');
  }

  /**
   * Get API URL with working model
   */
  async getApiUrl() {
    const model = await this.getWorkingModel();
    return `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
  }

  /**
   * Preprocess image for better AI recognition
   */
  async preprocessImage(buffer) {
    try {
      const optimizedBuffer = await sharp(buffer)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .normalize()
        .sharpen()
        .jpeg({ quality: 85 })
        .toBuffer();
      
      const savings = ((1 - optimizedBuffer.length / buffer.length) * 100).toFixed(1);
      console.log(`🖼️ Image: ${(buffer.length/1024).toFixed(1)}KB → ${(optimizedBuffer.length/1024).toFixed(1)}KB`);
      
      return optimizedBuffer;
    } catch (error) {
      console.warn('⚠️ Image optimization failed, using original:', error.message);
      return buffer;
    }
  }

  /**
   * Generate optimized prompt for receipt extraction
   */
  getOptimizedPrompt() {
    return `You are a precise receipt scanner. Extract data and return ONLY a JSON object. No markdown, no explanation.

Format:
{
  "merchantName": "Store Name",
  "totalAmount": 123.45,
  "receiptDate": "YYYY-MM-DD",
  "mainCategory": "Food|Shopping|Transport|Entertainment|Healthcare|Utilities|Other",
  "items": [
    {"description": "Item name", "amount": 12.50, "category": "Food"}
  ]
}

Key instructions:
- Extract ALL items from receipt
- totalAmount = final total (including tax)
- Thai receipts: find ฿ symbol for amounts
- Date format: YYYY-MM-DD (today is ${new Date().toISOString().split('T')[0]})
- Categories: Food, Shopping, Transport, Entertainment, Healthcare, Utilities, Other
- Return ONLY valid JSON`;
  }

  /**
   * Call Gemini API with retry logic
   */
  async callGeminiWithRetry(imageBuffer, mimeType, maxRetries = 2) {
    let lastError;
    
    const url = await this.getApiUrl();
    console.log(`🤖 Calling ${this.activeModel}...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const startCallTime = Date.now();
        
        const response = await axios.post(url, {
          contents: [{
            parts: [
              { text: this.getOptimizedPrompt() },
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: imageBuffer.toString('base64')
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            topP: 0.95,
            topK: 40
          }
        }, {
          timeout: 30000
        });

        const callDuration = ((Date.now() - startCallTime) / 1000).toFixed(1);
        
        // Validate response
        if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error('Empty AI response');
        }
        
        let text = response.data.candidates[0].content.parts[0].text;
        text = this.cleanAIResponse(text);
        
        const parsed = JSON.parse(text);
        
        // Build structured result
        const result = {
          merchantName: parsed.merchantName?.trim() || 'Unknown Store',
          totalAmount: Math.abs(parseFloat(parsed.totalAmount)) || 0,
          receiptDate: parsed.receiptDate || new Date().toISOString().split('T')[0],
          mainCategory: this.validateCategory(parsed.mainCategory),
          items: (parsed.items || []).map(item => ({
            description: item.description?.trim() || 'Unknown Item',
            amount: Math.abs(parseFloat(item.amount)) || 0,
            category: this.validateCategory(item.category || parsed.mainCategory)
          }))
        };
        
        console.log(`✅ Extracted in ${callDuration}s: ${result.merchantName} - ฿${result.totalAmount.toFixed(2)}`);
        return result;
        
      } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        console.warn(`⚠️ Attempt ${attempt}/${maxRetries}: ${errorMsg}`);
        lastError = error;
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Rate limited. Waiting ${waitTime/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (error.response?.status === 400) {
          console.error('❌ Bad request - stopping retries');
          break;
        } else if (error.response?.status === 403) {
          console.error('❌ Access denied - stopping retries');
          break;
        }
      }
    }
    
    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  }

  /**
   * Clean AI response text
   */
  cleanAIResponse(text) {
    let cleaned = text.trim();
    
    // Remove markdown fences
    cleaned = cleaned.replace(/```json\s*/gi, '');
    cleaned = cleaned.replace(/```\s*/g, '');
    
    // Extract JSON object
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    
    // Fix common JSON issues
    cleaned = cleaned
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ');
    
    return cleaned;
  }

  /**
   * Main receipt processing handler
   */
  processReceipt = async (req, res) => {
    const startTime = Date.now();
    
    try {
      // === Input Validation ===
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          message: 'กรุณาอัปโหลดรูปภาพ' 
        });
      }
      
      const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
      if (!validMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ 
          success: false,
          message: '❌ รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, WebP เท่านั้น' 
        });
      }
      
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: '❌ ไฟล์ต้องมีขนาดไม่เกิน 5MB'
        });
      }

      console.log('\n📸 === New Receipt Processing ===');
      console.log(`📎 File: ${(req.file.size / 1024).toFixed(1)}KB ${req.file.mimetype}`);
      console.log(`👤 User: ${req.user.userId}`);

      // === Image Processing ===
      const optimizedImage = await this.preprocessImage(req.file.buffer);
      
      // === AI Processing ===
      const result = await this.callGeminiWithRetry(optimizedImage, 'image/jpeg');

      // === Data Assembly ===
      const lineItems = result.items.length > 0 
        ? result.items 
        : [{
            description: 'รายการสินค้า',
            amount: result.totalAmount,
            quantity: 1,
            category: result.mainCategory
          }];

      const receiptData = {
        userId: req.user.userId,
        merchantName: result.merchantName,
        totalAmount: result.totalAmount,
        receiptDate: new Date(result.receiptDate),
        mainCategory: result.mainCategory,
        lineItems: lineItems
      };

      // === Save to Database ===
      const newReceipt = await Receipt.create(receiptData);
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`💾 Saved! ID: ${newReceipt._id}`);
      console.log(`⏱️ Total time: ${totalTime}s`);
      console.log('✅ === Processing Complete ===\n');

      // === Success Response ===
      res.status(200).json({
        success: true,
        message: `✅ วิเคราะห์สำเร็จ! (${totalTime} วินาที)`,
        data: {
          id: newReceipt._id,
          store: newReceipt.merchantName,
          total: newReceipt.totalAmount,
          items: newReceipt.lineItems.length,
          category: newReceipt.mainCategory,
          date: newReceipt.receiptDate,
          fullReceipt: newReceipt
        }
      });

    } catch (error) {
      console.error('❌ Error:', error.response?.data || error.message);
      
      // === Error Classification ===
      let statusCode = 500;
      let userMessage = '❌ ระบบขัดข้อง กรุณาลองใหม่';
      let errorCode = 'INTERNAL_ERROR';

      if (error.response?.status === 400) {
        statusCode = 422;
        userMessage = '❌ AI ไม่สามารถอ่านใบเสร็จได้\n💡 ลอง: ถ่ายรูปใหม่ให้ชัดขึ้น, วางบนพื้นเรียบ, ใช้แสงเพียงพอ';
        errorCode = 'AI_PARSE_ERROR';
      } else if (error.response?.status === 429) {
        statusCode = 429;
        userMessage = '⏳ API โควต้าเต็ม กรุณาลองใหม่ใน 1 นาที';
        errorCode = 'RATE_LIMIT';
      } else if (error.response?.status === 403) {
        statusCode = 500;
        userMessage = '🔑 ปัญหาการเข้าถึง API';
        errorCode = 'API_KEY_ERROR';
      } else if (error.message?.includes('JSON')) {
        statusCode = 422;
        userMessage = '❌ AI ให้ข้อมูลไม่สมบูรณ์ กรุณาลองใหม่';
        errorCode = 'PARSE_ERROR';
      }

      res.status(statusCode).json({
        success: false,
        message: userMessage,
        error: errorCode,
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  /**
   * Get receipts with filtering and pagination
   */
  getReceipts = async (req, res) => {
    try {
      const { 
        limit = 20, 
        page = 1, 
        sort = '-createdAt',
        category,
        startDate,
        endDate
      } = req.query;

      // Build filter
      const filter = { userId: req.user.userId };
      if (category) filter.mainCategory = category;
      if (startDate || endDate) {
        filter.receiptDate = {};
        if (startDate) filter.receiptDate.$gte = new Date(startDate);
        if (endDate) filter.receiptDate.$lte = new Date(endDate);
      }

      const [receipts, total] = await Promise.all([
        Receipt.find(filter)
          .sort(sort)
          .limit(Math.min(parseInt(limit), 100))
          .skip((parseInt(page) - 1) * parseInt(limit))
          .lean(),
        Receipt.countDocuments(filter)
      ]);

      res.status(200).json({
        success: true,
        data: receipts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('❌ Error fetching receipts:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch receipts' 
      });
    }
  };

  /**
   * Validate and normalize category
   */
  validateCategory(category) {
    const validCategories = [
      'Food', 'Shopping', 'Transport', 
      'Entertainment', 'Healthcare', 'Utilities', 'Other'
    ];
    
    if (!category) return 'Other';
    
    const formatted = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
    return validCategories.includes(formatted) ? formatted : 'Other';
  }
}

// Export controller instance
const controller = new ReceiptController();

module.exports = {
  processReceipt: controller.processReceipt,
  getReceipts: controller.getReceipts
};