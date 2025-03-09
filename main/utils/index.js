const mongoose = require('mongoose');
const Match = require('../models/Match'); // Adjust path as needed
const Group = require('../models/Group'); // Adjust path as needed
const { uuidv4 } = require('uuid');

// Utility to group members by a key (e.g., groupId)
const groupBy = (array, key) => {
    return array.reduce((result, current) => {
      (result[current[key]] = result[current[key]] || []).push(current);
      return result;
    }, {});
  }
  
  // Utility to shuffle an array (Fisher-Yates shuffle)
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

const generate_members = () => {
    const people = [];
  
    // Generate an array of 10 random people
    for (let i = 0; i < 10; i++) {
      const person = {
        _id: uuidv4(), // Generate random GUID for _id
        groupId: uuidv4(), // Generate random GUID for groupId
        firstName: faker.name.firstName(), // Random first name
        lastName: faker.name.lastName() // Random last name
      };
      people.push(person);
    }
    console.log(people);
  }
  
  /**
   * Removes all unarchived matches from a provided array of match IDs
   * @param {Array} matchIds - Array of populated Match objects
   * @param {string|mongoose.Types.ObjectId} groupId - The ID of the group these matches belong to
   * @returns {Promise<Object>} Result object with success status and details
   */
  const removeUnarchivedMatches = async (matchIds, groupId) => {
    try {
      // Validate inputs
      if (!Array.isArray(matchIds)) {
        return {
          success: false,
          message: 'matchIds must be an array',
          removedCount: 0
        };
      }
  
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return {
          success: false,
          message: 'Invalid group ID format',
          removedCount: 0
        };
      }
  
      // Filter out match IDs that are NOT archived (unarchived)
      const unarchivedMatchIds = matchIds
        .filter(match => !match.archived) // Changed to find unarchived matches
        .map(match => match._id);
      
      if (unarchivedMatchIds.length === 0) {
        return {
          success: true,
          message: 'No unarchived matches found',
          removedCount: 0
        };
      }
  
      // Remove unarchived matches from the database
      const deleteResult = await Match.deleteMany({
        _id: { $in: unarchivedMatchIds },
        groupId: groupId
      });
  
      // Update the group's matchIds array to remove references to deleted matches
      await Group.findByIdAndUpdate(groupId, {
        $pull: { matchIds: { $in: unarchivedMatchIds } }
      });
  
      return {
        success: true,
        message: `Successfully removed ${deleteResult.deletedCount} unarchived matches`,
        removedCount: deleteResult.deletedCount,
        removedMatchIds: unarchivedMatchIds
      };
    } catch (error) {
      console.error('Error removing unarchived matches:', error);
      return {
        success: false,
        message: `Error removing unarchived matches: ${error.message}`,
        error: error
      };
    }
  };

module.exports = { groupBy, shuffleArray, generate_members, removeUnarchivedMatches };