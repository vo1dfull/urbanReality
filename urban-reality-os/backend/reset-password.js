import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const resetPassword = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/urban-reality';
    await mongoose.connect(uri);
    
    const email = 'mirosot25@gmail.com';
    const newPassword = 'password123';
    
    const hashed = await bcrypt.hash(newPassword, 10);
    const result = await User.updateOne(
      { email },
      { password: hashed, isVerified: true }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`✅ Password reset for ${email}`);
      console.log(`📝 Use: email: ${email}, password: ${newPassword}`);
    } else {
      console.log('❌ User not found');
    }
    
    mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
};

resetPassword();
