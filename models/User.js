const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String },
  campus: { type: String },
  batch: { type: String },
  department: { type: String },
  password: { type: String },
  otp: { type: String },
  isVerified: { type: Boolean, default: false },
  otpExpiresAt: { type: Date },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  profilePhoto: { type: String },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  age: { type: Number },
  aboutMe: { type: String },
  nickname: { type: String },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field for remaining OTP time
UserSchema.virtual('otpRemainingTime').get(function() {
  if (!this.otpExpiresAt) return 0;
  return Math.max(0, Math.floor((this.otpExpiresAt - Date.now()) / 1000));
});

module.exports = mongoose.model('User', UserSchema);
