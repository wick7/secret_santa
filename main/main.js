//Express Setup
const express = require('express');
const app = express();
const port = 3000;

//Libraries
const { format } = require('date-fns');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

//Utils
const { faker } = require('@faker-js/faker');
const groupBy = require('./utils/index');
const shuffleArray = require('./utils/index');

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
        secretSanta: secretSanta._id,
        giftee: giftee._id,
        secretSantaFirstName: secretSanta.firstName,
        gifteeFirstName: giftee.firstName,
        groupId: group._id,
        groupName: group.name,
        dateMatched: new Date().toISOString(),
      });

      // Save the match
      await newMatch.save();
      matches.push(newMatch);
    }

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
  const matches = await Match.find();
  if (matches.length) {
    res.send(`
      <html>
        <body>
          <h1>Match Results</h1>
          ${matches
        .map(
          (member) => `
                <div>
                  <strong>Secret Santa:</strong> ${member.secretSantaFirstName} <br>
                  <strong>Giftee:</strong> ${member.gifteeFirstName} <br>
                  <strong>Date Matched:</strong> ${format(member.dateMatched, 'MM-dd-yyyy')}
                </div><hr>
              `
        )
        .join('')}
        </body>
      </html>
    `);
  } else if (matches.length === 0) {
    res.send('No matches found');
  }
});


// MEMBERS
app.post('/add_member', async (req, res) => {
  try {
    const { firstName, lastName, groupId, groupName, phoneNumber } = req.body;
    if (!firstName || !lastName || !groupId || !groupName || !phoneNumber) {
      return res.status(400).send('Missing required fields');
    }

    const newMember = new Member({
      _id: uuidv4(),
      groupId,
      firstName,
      lastName,
      groupName,
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
    const { name, year, memberIds } = req.body;  // Expecting memberIds as an array of ObjectIds

    if (!name || !year || !memberIds || memberIds.length === 0) {
      return res.status(400).json({ error: 'Missing required fields (name, year, memberIds)' });
    }

    // Create a new group with members
    const newGroup = new Group({
      name,
      year,
      members: memberIds,  // Array of member ObjectIds
    });

    // Save the new group to the database
    await newGroup.save();

    res.status(201).json({ message: 'Group created successfully!', data: newGroup });
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Error creating group' });
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
        <button onclick="location.href='/healthcheck'">Health Check</button>
        <button onclick="location.href='/generate_members'">Generate Members</button>
        <button onclick="location.href='/match'">Match</button>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
