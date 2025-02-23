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


// MATCHES
app.post('/match/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params; // Get groupId from URL params

    // Fetch the group and its members
    const group = await Group.findById(groupId).populate('members');
    
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const members = group.members;  // List of members in this group
    
    if (members.length < 2) {
      return res.status(400).json({ error: "Not enough members in the group to create matches" });
    }

    // Perform matching logic (e.g., randomize and ensure no repeats)
    const matches = [];
    const shuffledMembers = shuffleArray([...members]);  // Shuffle the array to randomize the matching

    for (let i = 0; i < shuffledMembers.length; i++) {
      const secretSanta = shuffledMembers[i];
      const giftee = shuffledMembers[(i + 1) % shuffledMembers.length]; // Circular matching

      // Ensure secretSanta is not matched with themselves
      if (secretSanta._id === giftee._id) {
        return res.status(400).json({ error: "Invalid matching, retrying..." });
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

app.get('/matches', async (req, res) => {
  try {
    // Get the groupId from the query parameters
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).send('Group ID is required');
    }

    // Fetch matches for the specific groupId and populate the secretSantaId and gifteeId
    const matches = await Match.find({ groupId })
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


// MEMBERS
app.post('/add_member', async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber } = req.body;
    if (!firstName || !lastName || !phoneNumber) {
      return res.status(400).send('Missing required fields');
    }

    const newMember = new Member({
      firstName,
      lastName,
      phoneNumber,
    });

    await newMember.save();
    res.status(201).send('Member added successfully!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding member');
  }
});

app.get('/members', async (req, res) => {
  const members = await Member.find();
  res.json(members);
});

// GROUPS
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

app.get('/groups', async (req, res) => {
  try {
    const groups = await Group.find().populate('members'); // Fetch all groups and populate members
    res.status(200).json(groups);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Error fetching groups' });
  }
});

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
