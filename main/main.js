//#region Required & Setup 
//Express Setup
const express = require('express');
const app = express();
const cors = require('cors');
const port = 3000;


//Libraries
const { format } = require('date-fns');
const mongoose = require('mongoose');

//Utils
const { shuffleArray } = require('./utils/index');
const { removeUnarchivedMatches } = require('./utils/index');

// Models
const Member = require('./models/Member');
const Match = require('./models/Match');
const Group = require('./models/Group');

// Mongo
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/secret_santa';

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB');
});

// Middleware
app.use(express.json());  // Enables JSON body parsing
app.use(express.urlencoded({ extended: true })); 
//#endregion

//#region MATCHES SECTION -------------------------------------------
//#region CREATE MATCHES
app.post('/api/match/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params; // Get groupId from URL params

    // Fetch the group and its members
    const group = await Group.findById(groupId).populate('members');
    
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if the group is archived
    if (group.archived) {
      return res.status(400).json({ error: "The group is archived. No further action can be taken on it." });
    }

    if (group.matchIds.length > 0) {
      await removeUnarchivedMatches(group.matchIds, group._id);
    }

    const members = group.members;  // List of members in this group
    
    if (members.length < 2) {
      return res.status(400).json({ error: "Not enough members in the group to create matches" });
    }

    // Perform matching logic (e.g., randomize and ensure no repeats)
    const matches = [];
    const shuffledMembers = shuffleArray([...members]);  // Shuffle the array to randomize the matching

    for (let i = 0; i < shuffledMembers.length; i++) {
      let secretSanta = shuffledMembers[i];
      let giftee = shuffledMembers[(i + 1) % shuffledMembers.length]; // Circular matching

      // Check if secretSanta and giftee have been matched before
      let attempts = 0;
      while (secretSanta.lastGifteeMatch.includes(giftee._id) && attempts < members.length) {
        // Try next giftee in the shuffled array
        giftee = shuffledMembers[(i + 1 + attempts) % shuffledMembers.length];
        attempts++;

        // If we've cycled through all members, exit to prevent infinite loop
        if (attempts >= members.length) {
          return res.status(400).json({ error: "Could not find a valid match. Please try again." });
        }
      }

      // Create the match
      const newMatch = new Match({
        secretSantaId: secretSanta._id,
        gifteeId: giftee._id,
        groupId: group._id,
        dateMatched: new Date().toISOString(),
      });

      // Save the match
      const savedMatch = await newMatch.save();
      matches.push(savedMatch);

      // Save match Id to the group
      group.matchIds.push(savedMatch._id);

      // Save the updated members' lastGifteeMatch
      await secretSanta.save();
      await giftee.save();
    }

    await group.save();

    res.status(201).json({
      message: 'Matches created successfully!',
      matches: matches
    });

  } catch (err) {
    console.error('Error matching members:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
//#endregion

//#region GET MATCHES
app.get('/api/matches', async (req, res) => {
  try {
    const { groupId, includeArchived } = req.query;  // Get the groupId and includeArchived from query parameters

    if (!groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    // Build the query to include or exclude archived matches
    let query = { groupId };
    
    // If includeArchived is not provided or false, include only non-archived matches
    if (includeArchived !== 'true') {
      query.archived = false;  // Only non-archived matches
    }

    // Fetch matches for the specific groupId and populate the secretSantaId and gifteeId
    const matches = await Match.find(query)
      .populate('secretSantaId', 'firstName lastName')
      .populate('gifteeId', 'firstName lastName');

    // Format the response data
    const formattedMatches = matches.map(match => ({
      id: match._id,
      secretSanta: {
        id: match.secretSantaId._id,
        firstName: match.secretSantaId.firstName,
        lastName: match.secretSantaId.lastName
      },
      giftee: {
        id: match.gifteeId._id,
        firstName: match.gifteeId.firstName,
        lastName: match.gifteeId.lastName
      },
      groupId: match.groupId,
      dateMatched: match.dateMatched,
      archived: match.archived
    }));

    res.json({
      count: matches.length,
      matches: formattedMatches
    });
    
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).json({ error: 'Error fetching matches' });
  }
});
//#endregion
//#endregion

//#region MEMBERS SECTION -------------------------------------------
//#region CREATE OR UPDATE MEMBER
app.post('/api/member', async (req, res) => {
  try {
    const members = req.body;  // Expecting an array of member objects

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).send('Request body must be an array of members');
    }

    const results = [];

    // Loop through each member object in the array
    for (const memberData of members) {
      const { id, firstName, lastName, phoneNumber } = memberData;

      // Check if all required fields are present
      if (!firstName || !lastName || !phoneNumber) {
        return res.status(400).send('Missing required fields in one or more member objects');
      }

      if (id) {
        // If ID exists, update the existing member
        const updatedMember = await Member.findByIdAndUpdate(
          id,
          { firstName, lastName, phoneNumber },
          { new: true, runValidators: true }
        );

        if (!updatedMember) {
          results.push({ success: false, message: `Member with ID ${id} not found` });
          continue;
        }

        results.push({ success: true, message: 'Member updated', member: updatedMember });
      } else {
        // Create a new member object if no ID is provided
        const newMember = new Member({
          firstName,
          lastName,
          phoneNumber,
          lastGifteeMatch: [],
        });

        // Save the member to the database
        await newMember.save();
        results.push({ success: true, message: 'Member added', member: newMember });
      }
    }

    // Respond with success message and results
    res.status(201).json({
      message: 'Members processed successfully',
      results
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing members');
  }
});
//#endregion

//#region GET ALL MEMBERS
app.get('/api/members', async (req, res) => {
  const members = await Member.find();
  res.json(members);
});
//#endregion

//#region MEMBER UPDATE LAST GIFTEE MATCH - Removes all but the most recent giftee match
app.post('/api/update_lastGifteeMatch/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params; // Get the memberId from the URL params
    const { gifteeId } = req.body; // Get the gifteeId from the request body

    if (!gifteeId) {
      return res.status(400).json({ error: 'GifteeId is required' });
    }

    // Find the member by their ID
    const member = await Member.findById(memberId);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Add the new gifteeId to the lastGifteeMatch array
    member.lastGifteeMatch.push(gifteeId);

    // Sort the lastGifteeMatch array based on ObjectId timestamps (ascending)
    member.lastGifteeMatch.sort((a, b) => b.getTimestamp() - a.getTimestamp());

    // Keep only the most recent match (the first element in the sorted array)
    member.lastGifteeMatch = [member.lastGifteeMatch[0]];

    // Save the updated member
    await member.save();

    res.status(200).json({
      message: 'Member lastGifteeMatch updated successfully!',
      lastGifteeMatch: member.lastGifteeMatch
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error updating lastGifteeMatch' });
  }
});
//#endregion
//#endregion

//#region GROUPS SECTION -------------------------------------------
//#region CREATE OR UPDATE GROUP
app.post('/api/group', async (req, res) => {
  try {
    const { id, name, year, memberIds } = req.body;  // Expecting memberIds as an array of ObjectIds

    if (!name || !year || !memberIds || memberIds.length === 0) {
      return res.status(400).json({ error: 'Missing required fields (name, year, memberIds)' });
    }

    if (id) {
      // If an ID is provided, update the existing group
      const group = await Group.findByIdAndUpdate(
        id,  // Use the provided ID to find and update the group
        { name, year, members: memberIds },
        { new: true }  // Return the updated group
      );

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      return res.status(200).json({ message: 'Group updated successfully!', data: group });
    }

    if (!id) {
      // If no ID is provided, create a new group
      const newGroup = new Group({
        name,
        year,
        members: memberIds,
      });

      // Save the new group to the database
      await newGroup.save();
      res.status(201).json({ message: 'Group created successfully!', data: newGroup });
    }

  } catch (err) {
    console.error('Error handling group:', err);
    res.status(500).json({ error: 'Error processing group' });
  }
});
//#endregion

//#region GET ALL GROUPS
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await Group.find().populate('members'); // Fetch all groups and populate members
    res.status(200).json(groups);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Error fetching groups' });
  }
});
//#endregion
//#endregion

//#region SPECIAL -------------------------------------
//#region NOTIFY MATCHES
app.post('/api/match/notification/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    // Validate groupId
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
      });
    }

    // Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if group has any matches
    if (!group.matchIds || group.matchIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No matches found for this group'
      });
    }

    // If group is already archived, return an error
    if (group.archived) {
      return res.status(400).json({
        success: false,
        message: 'Group is already archived (notifications already sent)'
      });
    }

    // Find all non-archived matches for this group
    const matches = await Match.find({
      _id: { $in: group.matchIds },
      archived: false
    });

    if (matches.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All matches in this group are already archived'
      });
    }

    // Set up Twilio client with your credentials
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const client = require('twilio')(accountSid, authToken);

    // Prepare to store results of all notifications
    const notificationResults = [];
    const failedNotifications = [];

    // Process each match and send notifications
    for (const match of matches) {
      // Get the secret Santa and giftee details
      const secretSanta = await Member.findById(match.secretSantaId);
      const giftee = await Member.findById(match.gifteeId);

      if (!secretSanta || !giftee) {
        console.log(`Match ${match._id} failed: Secret Santa or giftee member not found`);
        failedNotifications.push({
          matchId: match._id,
          error: 'Secret Santa or giftee member not found'
        });
        continue;
      }

      // Generate text message string
      const messageText = `Hi ${secretSanta.firstName}, you are the Secret Santa for ${giftee.firstName} ${giftee.lastName}! Please refer to the Excel spreadsheet for gift ideas. Happy gifting!`;

      try {
        // Try to send the text message via Twilio
        const twilioMessage = await client.messages.create({
          body: messageText,
          from: twilioPhoneNumber,
          to: secretSanta.phoneNumber
        });

        console.log(`Twilio message sent successfully for match ${match._id}:`, twilioMessage.sid);

        // ONLY after successful text message:
        // 1. Update the match to archived status
        match.archived = true;
        await match.save();

        // 2. Update the secretSanta's lastGifteeMatch array by adding giftee's ID
        await Member.findByIdAndUpdate(
          secretSanta._id,
          { $push: { lastGifteeMatch: giftee._id } }
        );

        // 3. Add successful notification to results
        notificationResults.push({
          success: true,
          twilioMessageSid: twilioMessage.sid,
          secretSanta: {
            id: secretSanta._id,
            name: `${secretSanta.firstName} ${secretSanta.lastName}`,
            phoneNumber: secretSanta.phoneNumber
          },
          giftee: {
            id: giftee._id,
            name: `${giftee.firstName} ${giftee.lastName}`
          },
          messageText,
          matchId: match._id,
          matchArchived: true,
          memberUpdated: true
        });
      } catch (twilioError) {
        // If Twilio message fails, DO NOT archive the match
        console.error(`Error sending Twilio message for match ${match._id}:`, twilioError);
        failedNotifications.push({
          matchId: match._id,
          secretSantaId: secretSanta._id,
          gifteeId: giftee._id,
          error: `Failed to send SMS: ${twilioError.message}`,
          matchArchived: false,
          memberUpdated: false
        });
      }
    }

    // If all notifications were successful, archive the group
    if (failedNotifications.length === 0 && notificationResults.length > 0) {
      group.archived = true;
      await group.save();
    }

    // Prepare response data
    const responseData = {
      success: notificationResults.length > 0,
      totalMatches: matches.length,
      successfulNotifications: notificationResults.length,
      failedNotifications: failedNotifications.length,
      groupArchived: group.archived,
      notifications: notificationResults
    };

    // If there were failures, include them in the response
    if (failedNotifications.length > 0) {
      responseData.failures = failedNotifications;
    }

    // Always return JSON response
    return res.json(responseData);
  } catch (error) {
    console.error('Error generating match notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while generating match notifications',
      error: error.message
    });
  }
});
//#endregion

// DELETE GROUPS OR MEMBERS
// DELETE MEMBER
//#region
app.delete('/api/member/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate id
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid member ID format'
      });
    }

    // Find and delete the member
    const deletedMember = await Member.findByIdAndDelete(id);

    if (!deletedMember) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Find any groups containing this member and remove the member
    await Group.updateMany(
      { members: id },
      { $pull: { members: id } }
    );

    // Find any matches where this member is a secret santa or giftee
    await Match.deleteMany({
      $or: [
        { secretSantaId: id },
        { gifteeId: id }
      ]
    });

    return res.json({
      success: true,
      message: 'Member deleted successfully',
      member: deletedMember
    });
  } catch (error) {
    console.error('Error deleting member:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting member',
      error: error.message
    });
  }
});
//#endregion

// DELETE GROUP AND ITS MATCHES
//#region
app.delete('/api/group/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate id
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
      });
    }

    // Find the group first
    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Delete all matches associated with this group
    let deletedMatchesCount = 0;
    if (group.matchIds && group.matchIds.length > 0) {
      const deleteResult = await Match.deleteMany({ 
        _id: { $in: group.matchIds } 
      });
      deletedMatchesCount = deleteResult.deletedCount;
    }

    // Delete the group
    const deletedGroup = await Group.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: 'Group and associated matches deleted successfully',
      group: deletedGroup,
      deletedMatchesCount
    });
  } catch (error) {
    console.error('Error deleting group:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting group',
      error: error.message
    });
  }
});
//#endregion
//#endregion

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
