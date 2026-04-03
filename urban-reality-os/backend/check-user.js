import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const checkUser = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/urban-reality';
    await mongoose.connect(uri);
    
    const email = 'mirosot25@gmail.com';
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found');
    } else {
      console.log('✅ User found:');
      console.log('  Email:', user.email);
      console.log('  Name:', user.name);
      console.log('  isVerified:', user.isVerified);
      console.log('  Password hash length:', user.password ? user.password.length : 'None');
      console.log('  Password hash:', user.password ? user.password.substring(0, 20) + '...' : 'None');
    }
    
    mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
};

checkUser();
