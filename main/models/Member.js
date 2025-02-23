const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phoneNumber: String,
});

module.exports = mongoose.model('Member', memberSchema);