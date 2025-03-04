//Express Setup
const express = require('express');
const app = express();
const cors = require('cors');
const port = 3000;


app.use(cors({
  origin: ['http://interface:3000', 'http://localhost:3002'],
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

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
app.get('/api/matches', async (req, res) => {
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

// MATCH VIEW
//#region 
// In main.js
app.get('/api/matches-html', async (req, res) => {
  try {
    // Get the groupId from query parameters, if provided
    const { groupId } = req.query;
    
    let matches;
    if (groupId) {
      // If groupId is provided, get matches for that group
      matches = await Match.find({ groupId })
        .populate('secretSantaId')
        .populate('gifteeId')
        .populate('groupId');
    } else {
      // Otherwise get all matches
      matches = await Match.find()
        .populate('secretSantaId')
        .populate('gifteeId')
        .populate('groupId');
    }
    
    let html = `
      <table class="table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Secret Santa</th>
            <th>Giftee</th>
            <th>Date Matched</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    if (matches.length === 0) {
      html += '<tr><td colspan="6">No matches found</td></tr>';
    } else {
      matches.forEach(match => {
        const secretSanta = match.secretSantaId;
        const giftee = match.gifteeId;
        const group = match.groupId;
        
        html += `
          <tr>
            <td>${group ? group.name + ' (' + group.year + ')' : 'Unknown Group'}</td>
            <td>${secretSanta ? secretSanta.firstName + ' ' + secretSanta.lastName : 'Unknown'}</td>
            <td>${giftee ? giftee.firstName + ' ' + giftee.lastName : 'Unknown'}</td>
            <td>${new Date(match.dateMatched).toLocaleDateString()}</td>
            <td>${match.archived ? 'Archived' : 'Active'}</td>
            <td>
              <button class="btn btn-sm" 
                      hx-get="/api/match-details/${match._id}" 
                      hx-target="#match-details-container"
                      hx-swap="innerHTML">View Details</button>
              ${!match.archived ? `
                <button class="btn btn-sm btn-success" 
                        hx-post="/api/matches/${match._id}/notify" 
                        hx-target="#match-details-container"
                        hx-swap="innerHTML">Notify</button>
              ` : ''}
              <button class="btn btn-sm btn-danger" 
                      hx-delete="/api/matches/${match._id}" 
                      hx-confirm="Are you sure you want to delete this match?"
                      hx-target="#matches-list"
                      hx-swap="innerHTML">Delete</button>
            </td>
          </tr>
        `;
      });
    }
    
    html += `
        </tbody>
      </table>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`<div>Error loading matches: ${error.message}</div>`);
  }
});
//#endregion

// MEMBERS SECTION -------------------------------------------
// ADD MEMBER
//#region
app.post('/api/add_member', async (req, res) => {
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

// GET ALL MEMBERS
//#region
app.get('/api/members', async (req, res) => {
  const members = await Member.find();
  res.json(members);
});

// MEMBERS VIEW
app.get('/api/members-html', async (req, res) => {
  const members = await Member.find();
  
  let html = `
    <table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone Number</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  if (members.length === 0) {
    html += '<tr><td colspan="3">No members found</td></tr>';
  } else {
    members.forEach(member => {
      // Format phone number
      let formattedPhone = member.phoneNumber;
      if (formattedPhone && formattedPhone.length === 10) {
        formattedPhone = `(${formattedPhone.substring(0, 3)}) ${formattedPhone.substring(3, 6)}-${formattedPhone.substring(6)}`;
      }
      
      html += `
        <tr>
          <td>${member.firstName} ${member.lastName}</td>
          <td>${formattedPhone || 'N/A'}</td>
          <td style="min-width: 150px;">
            <button class="btn btn-sm" 
                    style="margin-right: 5px;"
                    hx-get="/partials/member-form?id=${member._id}" 
                    hx-target="#member-form-container"
                    hx-swap="innerHTML">Edit</button>
            <button class="btn btn-sm btn-danger" 
                    hx-delete="/api/members/${member._id}" 
                    hx-confirm="Are you sure you want to delete this member?"
                    hx-target="#members-list"
                    hx-swap="innerHTML">Delete</button>
          </td>
        </tr>
      `;
    });
  }
  
  html += `
      </tbody>
    </table>
  `;
  
  res.send(html);
});

// In interface/interface.js
app.get('/partials/member-form', async (req, res) => {
  try {
    const memberId = req.query.id;
    let member = null;
    
    if (memberId) {
      // Fetch member data from the API if editing
      const response = await axios.get(`http://localhost:3001/api/members/${memberId}`);
      member = response.data;
      
      console.log("Fetched member data:", member); // For debugging
    }
    
    // Return HTML form with populated values if member exists
    const html = `
      <div class="panel">
        <h3>${member ? 'Edit' : 'Add'} Member</h3>
        
        <form ${member ? 
          `hx-put="/api/members/${member._id}"` : 
          'hx-post="/api/members"'
        }
              hx-target="#members-list"
              hx-swap="innerHTML">
          
          <div class="form-group">
            <label for="firstName">First Name</label>
            <input type="text" id="firstName" name="firstName" class="form-control" value="${member ? member.firstName : ''}" required>
          </div>
          
          <div class="form-group">
            <label for="lastName">Last Name</label>
            <input type="text" id="lastName" name="lastName" class="form-control" value="${member ? member.lastName : ''}" required>
          </div>
          
          <div class="form-group">
            <label for="phoneNumber">Phone Number</label>
            <input type="tel" id="phoneNumber" name="phoneNumber" class="form-control" value="${member ? member.phoneNumber : ''}" required>
          </div>
          
          <div class="form-group">
            <button type="submit" class="btn btn-success">Save Member</button>
            <button type="button" class="btn" onclick="document.getElementById('member-form-container').innerHTML = ''">Cancel</button>
          </div>
        </form>
      </div>
    `;
    
    res.send(html);
  } catch (error) {
    console.error("Error in member form:", error);
    res.status(500).send(`
      <div class="panel">
        <h3>Error</h3>
        <p>Failed to load member form: ${error.message}</p>
        <button class="btn" onclick="document.getElementById('member-form-container').innerHTML = ''">Close</button>
      </div>
    `);
  }
});
//#endregion

// GROUPS SECTION -------------------------------------------
// CREATE OR UPDATE GROUP
//#region
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

// GET ALL GROUPS
//#region
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await Group.find().populate('members'); // Fetch all groups and populate members
    res.status(200).json(groups);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Error fetching groups' });
  }
});

// GROUPS VIEW
//#region 
app.get('/api/groups-html', async (req, res) => {
  try {
    const groups = await Group.find().populate('members');
    
    let html = `
      <table class="table">
        <thead>
          <tr>
            <th>Group Name</th>
            <th>Year</th>
            <th>Members</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    if (groups.length === 0) {
      html += '<tr><td colspan="5">No groups found</td></tr>';
    } else {
      groups.forEach(group => {
        html += `
          <tr>
            <td>${group.name}</td>
            <td>${group.year}</td>
            <td>${group.members.length} members</td>
            <td>${group.archived ? 'Archived' : 'Active'}</td>
            <td>
              <button class="btn btn-sm" 
                      hx-get="/partials/group-form?id=${group._id}" 
                      hx-target="#group-form-container"
                      hx-swap="innerHTML">Edit</button>
              <button class="btn btn-sm btn-danger" 
                      hx-delete="/api/groups/${group._id}" 
                      hx-confirm="Are you sure you want to delete this group?"
                      hx-target="#groups-list"
                      hx-swap="innerHTML">Delete</button>
            </td>
          </tr>
        `;
      });
    }
    
    html += `
        </tbody>
      </table>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`<div>Error loading groups: ${error.message}</div>`);
  }
});
//#endregion
//#endregion

// Notify Matches
//#region
/**
 * Endpoint to get the notification for the latest match in a group
 * POST /match/notification/:groupId
 */
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
app.get('/api/', (req, res) => {
  // res.send(`
  //   <html>
  //     <head>
  //       <title>Navigation</title>
  //     </head>
  //     <body>
  //       <h1>Welcome!</h1>
  //       <p>Click a button to navigate:</p>
  //       <button onclick="location.href='/api/matches'">See Matches</button>
  //       <button onclick="location.href='/api/members'">See Members</button>
  //       <button onclick="location.href='/api/groups'">See Groups</button>
  //     </body>
  //   </html>
  // `);
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
  
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
