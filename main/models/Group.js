const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the Group Schema
const groupSchema = new Schema({
  name: { type: String, required: true },  // Group name (e.g., "Family")
  year: { type: String, required: true },  // Year (e.g., "2025")
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }],  // Array of Member references
  matchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match' }],  // Array of matches
  archived: { type: Boolean, default: false },  // Flag to indicate if the group is archived i.e. notifications sent
});

// Create and export the Group model
module.exports = mongoose.model('Group', groupSchema);