/**
 * Database seed script.
 * Creates a default admin user for initial setup.
 * Usage: npm run seed
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

const crypto = require('crypto');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      process.exit(0);
    }

    // Generate a secure random password instead of using a hardcoded one
    const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@pulse.com';

    const admin = await User.create({
      username: 'admin',
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      organisation: 'default',
    });

    console.log('Admin user created successfully:');
    console.log(`  Email: ${admin.email}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  Role: ${admin.role}`);
    console.log('\n  IMPORTANT: Save this password now. It cannot be retrieved later.');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
};

seedAdmin();
