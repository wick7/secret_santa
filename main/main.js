//Express Setup
const express = require('express');
const app = express();
const port = 3000;

//Libraries
const { format } = require('date-fns');
const mongoose = require('mongoose');

//Utils
const { shuffleArray } = require('./utils/index');

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


// MATCHES SECTION -------------------------------------------
// CREATE MATCHES
//#region
app.post('/match/:groupId', async (req, res) => {
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

    // CHECK IF GROUP ALREADY HAS MATCHES, IF SO RETURN 400 AND SHOW MATCHES
    // SUGGEST OTHER OPTIONS IF THEY WANT TO RE-RUN MATCHES

    if (group.matchIds.length > 0) {
      removeUnarchivedMatches(group.matchIds, group._id);
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

      // Add the giftee to the secretSanta's lastGifteeMatch array
      // NOTE THIS NEEDS TO MOVE TO THE NOTIFICATION ENDPOINT
      secretSanta.lastGifteeMatch.push(giftee._id);

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

// GET MATCHES
//#region
app.get('/matches', async (req, res) => {
  try {
    const { groupId, includeArchived } = req.query;  // Get the groupId and includeArchived from query parameters

    if (!groupId) {
      return res.status(400).send('Group ID is required');
    }

    // Build the query to include or exclude archived matches
    let query = { groupId };
    
    // If includeArchived is not provided or false, include only non-archived matches
    if (includeArchived !== 'true') {
      query.archived = false;  // Only non-archived matches
    }

    // Fetch matches for the specific groupId and populate the secretSantaId and gifteeId
    const matches = await Match.find(query)
      .populate('secretSantaId', 'firstName')
      .populate('gifteeId', 'firstName');

    if (matches.length) {
      res.send(`
        <html>
          <body>
            <h1>Match Results</h1>
            ${matches
              .map(
                (match) => `
                  <div>
                    <strong>Secret Santa:</strong> ${match.secretSantaId.firstName} <br>
                    <strong>Giftee:</strong> ${match.gifteeId.firstName} <br>
                    <strong>Date Matched:</strong> ${format(match.dateMatched, 'MM-dd-yyyy')}
                  </div><hr>
                `
              )
              .join('')}
          </body>
        </html>
      `);
    } else {
      res.send('No matches found for this group');
    }
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).send('Error fetching matches');
  }
});
//#endregion

// MEMBERS SECTION -------------------------------------------
// ADD MEMBER
//#region
app.post('/add_member', async (req, res) => {
  try {
    const members = req.body;  // Expecting an array of member objects

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).send('Request body must be an array of members');
    }

    // Loop through each member object in the array
    for (const memberData of members) {
      const { firstName, lastName, phoneNumber } = memberData;

      // Check if all required fields are present
      if (!firstName || !lastName || !phoneNumber) {
        return res.status(400).send('Missing required fields in one or more member objects');
      }

      // Create a new member object
      const newMember = new Member({
        firstName,
        lastName,
        phoneNumber,
        lastGifteeMatch: [],
      });

      // Save the member to the database
      await newMember.save();
    }

    // Respond with success message
    res.status(201).send('Members added successfully!');

  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding members');
  }
});
//#endregion

// MEMBER UPDATE LAST GIFTEE MATCH
//#region
app.post('/update_lastGifteeMatch/:memberId', async (req, res) => {
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

// GET ALL MEMBERS
//#region
app.get('/members', async (req, res) => {
  const members = await Member.find();
  res.json(members);
});
//#endregion

// GROUPS SECTION -------------------------------------------
// CREATE OR UPDATE GROUP
//#region
app.post('/group', async (req, res) => {
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

// GET ALL GROUPS
//#region
app.get('/groups', async (req, res) => {
  try {
    const groups = await Group.find().populate('members'); // Fetch all groups and populate members
    res.status(200).json(groups);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Error fetching groups' });
  }
});
//#endregion

// Notify Matches
//#region
/**
 * Endpoint to get the notification for the latest match in a group
 * POST /match/notification/:groupId
 */
app.post('/match/notification/:groupId', async (req, res) => {
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

    // Get the latest match ID (assuming last item in array is most recent)
    const latestMatchId = group.matchIds[group.matchIds.length - 1];

    // Find the match and confirm it's not archived
    const match = await Match.findById(latestMatchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Latest match not found'
      });
    }

    if (match.archived) {
      return res.status(400).json({
        success: false,
        message: 'Latest match is already archived (notification already sent)'
      });
    }

    // Get the secret Santa and giftee details
    const secretSanta = await Member.findById(match.secretSantaId);
    const giftee = await Member.findById(match.gifteeId);

    if (!secretSanta || !giftee) {
      return res.status(404).json({
        success: false,
        message: 'Secret Santa or giftee member not found'
      });
    }
    
    // ARCHIVE MATCH AND POPULATE MEMBER WHO IS SECRETE SANTA WITH GIFTEE'S ID

    // Generate text message string
    const messageText = `Hi ${secretSanta.firstName}, you are the Secret Santa for ${giftee.firstName} ${giftee.lastName}! Please refer to the Excel spreadsheet for gift ideas. Happy gifting!`;

    // Format response based on requested content type
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      // Return JSON if explicitly requested
      return res.json({
        success: true,
        secretSanta: {
          id: secretSanta._id,
          name: `${secretSanta.firstName} ${secretSanta.lastName}`,
          phoneNumber: secretSanta.phoneNumber
        },
        giftee: {
          id: giftee._id,
          name: `${giftee.firstName} ${giftee.lastName}`,
          phoneNumber: giftee.phoneNumber
        },
        messageText,
        matchId: match._id
      });
    } else {
      // Return HTML by default
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Secret Santa Notification</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
            .container { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; border-radius: 5px; }
            .details { margin-bottom: 20px; }
            .message { background-color: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; }
            h1 { color: #333; }
            h2 { color: #555; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Secret Santa Notification</h1>
            
            <div class="details">
              <h2>Secret Santa</h2>
              <p><strong>Name:</strong> ${secretSanta.firstName} ${secretSanta.lastName}</p>
              <p><strong>Phone:</strong> ${secretSanta.phoneNumber}</p>
            </div>
            
            <div class="details">
              <h2>Giftee</h2>
              <p><strong>Name:</strong> ${giftee.firstName} ${giftee.lastName}</p>
              <p><strong>Phone:</strong> ${giftee.phoneNumber}</p>
            </div>
            
            <div class="message">
              <h2>Text Message</h2>
              <p>${messageText}</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      return res.send(html);
    }
  } catch (error) {
    console.error('Error generating match notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while generating match notification',
      error: error.message
    });
  }
});
//#endregion

// Temp Interface
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Navigation</title>
      </head>
      <body>
        <h1>Welcome!</h1>
        <p>Click a button to navigate:</p>
        <button onclick="location.href='/matches'">See Matches</button>
        <button onclick="location.href='/members'">See Members</button>
        <button onclick="location.href='/groups'">See Groups</button>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
