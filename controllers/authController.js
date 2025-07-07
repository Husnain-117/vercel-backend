const connectionCache = require('../utils/connectioncache');
const { connections: activeConnections } = connectionCache;

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

// Helper functions
const validatePassword = (password) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
  return regex.test(password);
};

const validateNUEmail = (email) => {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith('@nu.edu.pk');
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Email handling
// Email configuration with custom display name
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper function to format email sender
const formatEmailSender = (email) => {
  return `FASTConnect <${email}>`;
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (email, otp) => {
  try {
    await transporter.sendMail({
      from: formatEmailSender(process.env.EMAIL_USER),
      to: email,
      subject: 'FASTConnect Account Verification',
      text: `Your verification code is: ${otp}. This code will expire in 5 minutes.`,
      html: `<p>Your verification code is: <strong>${otp}</strong>. This code will expire in 5 minutes.</p>`
    });
    return true;
  } catch (error) {
    console.error('Error sending OTP:', error);
    return false;
  }
};

exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email domain
    if (!validateNUEmail(email)) {
      return res.status(400).json({ message: 'Email must be a valid NU email (@nu.edu.pk)' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      // If user is fully registered, don't send OTP
      if (existingUser.password) {
        return res.status(400).json({ 
          message: 'User already registered. Please proceed to login.',
          type: 'registered'
        });
      }

      // Calculate remaining cooldown time
      const now = new Date();
      const lastOTPTime = existingUser.otpExpiresAt ? new Date(existingUser.otpExpiresAt) : null;
      const cooldownTime = 60000; // 1 minute cooldown
      
      // If OTP was sent recently (within cooldown period)
      if (lastOTPTime && now.getTime() - lastOTPTime.getTime() < cooldownTime) {
        const remainingTime = Math.ceil((cooldownTime - (now.getTime() - lastOTPTime.getTime())) / 1000);
        return res.status(400).json({ 
          message: `Please wait ${remainingTime} seconds before requesting another OTP.`,
          type: 'otp_pending',
          remainingTime
        });
      }

      // Generate new OTP
      const otp = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 minutes
      
      // Update user's OTP and reset cooldown
      existingUser.otp = otp;
      existingUser.otpExpiresAt = otpExpiresAt;
      await existingUser.save();
      
      // Send new OTP
      const sent = await sendOTP(email, otp);
      if (!sent) {
        return res.status(500).json({ message: 'Failed to send OTP' });
      }
      
      res.status(200).json({
        message: 'New OTP sent successfully. Please check your email.',
        type: 'otp_sent',
        user: {
          _id: existingUser._id,
          email: existingUser.email
        }
      });
      return;
    }

    // For new users
    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 minutes

    // Create new user with OTP
    const user = new User({
      email,
      otp,
      otpExpiresAt
    });

    // Send OTP to email
    const sent = await sendOTP(email, otp);
    if (!sent) {
      return res.status(500).json({ message: 'Failed to send OTP' });
    }

    // Save new user
    await user.save();
    
    res.status(200).json({
      message: 'OTP sent successfully. Please check your email.',
      type: 'otp_sent',
      user: {
        _id: user._id,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyAndRegister = async (req, res) => {
  try {
    const { email, otp, password, name, campus, batch } = req.body;

    // Validate email domain
    if (!validateNUEmail(email)) {
      return res.status(400).json({ message: 'Email must be a valid NU email (@nu.edu.pk)' });
    }

    // Validate password
    if (!validatePassword(password)) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.' 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify OTP
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Check OTP expiration
    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Update user with registration details
    user.password = await bcrypt.hash(password, 10);
    user.name = name;
    user.campus = campus;
    user.batch = batch;
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiresAt = undefined;

    await user.save();

    // Generate token
    const token = generateToken(user);

    // Send welcome email
    await transporter.sendMail({
      from: formatEmailSender(process.env.EMAIL_USER),
      to: email,
      subject: 'Welcome to FASTConnect!',
      text: `Welcome ${name}! You have successfully registered with FASTConnect.`,
      html: `<h2>Welcome ${name}!</h2><p>You have successfully registered with FASTConnect. You can now start connecting with your fellow students.</p>`
    });

    res.status(200).json({
      message: 'Registration successful. Redirecting to login...',
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        campus: user.campus,
        batch: user.batch
      },
      redirect: true
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!validateNUEmail(email)) {
      return res.status(400).json({ message: 'Email must be a valid NU email (@nu.edu.pk)' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 15); // OTP expires in 15 minutes

    // Update user with OTP
    user.otp = otp;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    // Send OTP email
    await transporter.sendMail({
      from: formatEmailSender(process.env.EMAIL_USER),
      to: email,
      subject: 'FASTConnect Password Reset Request',
      text: `Your password reset OTP is: ${otp}. This OTP will expire in 15 minutes.`,
      html: `
        <h2>Password Reset Request</h2>
        <p>Your password reset OTP is: <strong>${otp}</strong></p>
        <p>This OTP will expire in 15 minutes.</p>
      `
    });

    res.status(200).json({
      message: 'Password reset OTP has been sent to your email'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Validate password
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.' 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify OTP
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Check OTP expiration
    if (user.otpExpiresAt < Date.now()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    // Send success email
    await transporter.sendMail({
      from: formatEmailSender(process.env.EMAIL_USER),
      to: email,
      subject: 'FASTConnect Password Changed Successfully',
      text: 'Your password has been successfully changed.',
      html: '<h2>Password Changed Successfully</h2><p>Your password has been successfully changed.</p>'
    });

    res.status(200).json({
      message: 'Password has been successfully changed. Please login with your new password.'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if OTP is expired
    if (user.otpExpiresAt < Date.now()) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    // Verify OTP
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Update user verification status
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    // Generate JWT token
    const token = generateToken(user);

    res.status(200).json({
      message: 'OTP verified successfully',
      token,
      user: {
        _id: user._id,
        email: user.email,
        department: user.department,
        semester: user.semester,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // Mark user as online and update last seen
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // Update active connections
    connectionCache.updateConnection(user._id.toString());

    // Create JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1d'
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        isOnline: true
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Update status in DB
    await User.findByIdAndUpdate(userId, {
      isOnline: false,
      lastSeen: new Date()
    });

    // Remove from active connections
    connectionCache.removeConnection(userId.toString());

    res.json({ success: true, message: 'User logged out successfully' });

  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Note: Cleanup of inactive users is now handled by the connection cache utility

exports.searchUsers = async (req, res) => {
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Get filter parameters
    const { name, campus, searchType } = req.query;
    const filter = {};

    // Add filters based on search type
    if (searchType === 'name') {
      if (name) {
        filter.$or = [
          { name: { $regex: name, $options: 'i' } },
          { email: { $regex: name, $options: 'i' } }
        ];
      }
    } else if (searchType === 'campus') {
      if (campus) {
        filter.campus = { $regex: campus, $options: 'i' };
      }
    } else {
      // Default to name search if no type specified
      if (name) {
        filter.$or = [
          { name: { $regex: name, $options: 'i' } },
          { email: { $regex: name, $options: 'i' } }
        ];
      }
    }

    // Get total count with filters
    const totalCount = await User.countDocuments(filter);

    // Get users with pagination and filters
    const users = await User.find(filter, { password: 0 })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      // Add additional fields for display
      .select('name email campus batch department isVerified lastActive')
      .populate({
        path: 'batch',
        select: 'year',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'department',
        select: 'name',
        options: { strictPopulate: false }
      });

    // Format response
    const formattedUsers = users.map(user => ({
      ...user.toObject(),
      isOnline: user.lastActive && new Date() - new Date(user.lastActive) < 5 * 60 * 1000,
      lastActive: user.lastActive ? user.lastActive.toISOString() : null
    }));

    res.json({
      users: formattedUsers,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount
    });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid parameter format' });
    res.status(500).json({ message: error.message });
  }
};

// Get all users (admin route)
exports.getAllUsers = async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const totalCount = await User.countDocuments({});

    // Get all users with pagination
    const users = await User.find({}, { password: 0 })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .select('name email campus batch department isVerified lastActive role');

    res.json({
      users,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount
    });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid parameter format' });
    res.status(500).json({ message: error.message });
  }
};

// Add a user to favorites
exports.addFavorite = async (req, res) => {
  try {
    const { favoriteId } = req.params;
    const userId = req.user.id;
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already in favorites
    if (user.favorites.includes(favoriteId)) {
      return res.status(400).json({ message: 'User already in favorites' });
    }

    // Add to favorites
    user.favorites.push(favoriteId);
    await user.save();
    
    res.status(200).json({ 
      success: true,
      message: 'Added to favorites', 
      favoriteId 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Remove a user from favorites
exports.removeFavorite = async (req, res) => {
  try {
    const { favoriteId } = req.params;
    const userId = req.user.id;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if in favorites
    const favoriteIndex = user.favorites.indexOf(favoriteId);
    if (favoriteIndex === -1) {
      return res.status(400).json({ 
        success: false,
        message: 'User not in favorites' 
      });
    }

    // Remove from favorites
    user.favorites.splice(favoriteIndex, 1);
    await user.save();
    
    res.status(200).json({ 
      success: true,
      message: 'Removed from favorites', 
      favoriteId 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get all favorites for current user
exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user with populated favorites
    const user = await User.findById(userId)
      .populate('favorites', 'name email profileImage')
      .select('favorites');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.status(200).json({ 
      success: true,
      favorites: user.favorites 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ message: 'User deleted successfully', deletedUser: { id: deletedUser._id, email: deletedUser.email, name: deletedUser.name } });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid user ID format' });
    res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
