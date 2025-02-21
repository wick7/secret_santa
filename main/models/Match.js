const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  secretSanta: String,
  giftee: String,
  secretSantaFirstName: String,
  gifteeFirstName: String,
  groupId: String,
  groupName: String,
  dateMatched: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Match', matchSchema);