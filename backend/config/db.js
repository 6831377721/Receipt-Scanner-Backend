const mongoose = require('mongoose'); 
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

// ==========================================
// Database Connection
// ==========================================
async function connectDB(){
    if (cached.conn){
        return cached.conn;
    }
    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGODB_URI).then((mongoose) => {
            return mongoose;
        });
    }
}

module.exports = connectDB;
/*mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Successfully connected to MongoDB'))
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('URI ที่ใช้:', process.env.MONGODB_URI);
  });*/