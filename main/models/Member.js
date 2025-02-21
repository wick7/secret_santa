const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  _id: String,
  groupId: String,
  firstName: String,
  lastName: String,
  groupName: String,
  phoneNumber: String,
});

module.exports = mongoose.model('Member', memberSchema);