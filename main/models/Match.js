const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  secretSantaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
  gifteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  dateMatched: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Match', matchSchema);