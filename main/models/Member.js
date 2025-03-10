const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phoneNumber: String,
  email: String,
  lastGifteeMatch: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }], // Id of last member user was secret santa for
});

module.exports = mongoose.model('Member', memberSchema);