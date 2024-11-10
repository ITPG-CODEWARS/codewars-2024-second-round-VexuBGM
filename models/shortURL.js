const mongoose = require('mongoose');
const shortId = require('shortid');

const shortURLSchema = new mongoose.Schema({
  full: {
    type: String,
    required: true
  },
  short: {
    type: String,
    required: true,
    default: shortId.generate,
    unique: true 
  },
  clicks: {
    type: Number,
    required: true,
    default: 0
  },
  expiresAt: {
    type: Date,
    default: null // Optional expiration date
  },
  maxUses: {
    type: Number,
    default: null // Optional maximum uses
  }
});

module.exports = mongoose.model('ShortURL', shortURLSchema);