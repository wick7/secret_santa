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
const memberData = require('./data/member.json');


// Use the environment variable or a default value
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/secret_santa';

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB');
});


app.get('/match', (req, res) => {
  const groupedMembers = groupBy(memberData, 'groupId');
  const matches = [];

  for (const groupId in groupedMembers) {
    const groupMembers = groupedMembers[groupId];
    const shuffledMembers = shuffleArray([...groupMembers]);

    for (let i = 0; i < shuffledMembers.length; i++) {
      const secretSanta = shuffledMembers[i];
      const giftee = shuffledMembers[(i + 1) % shuffledMembers.length]; // Circular matching

      matches.push({
        secretSanta: secretSanta._id,
        giftee: giftee._id,
        secretSantaFirstName: secretSanta.firstName,
        gifteeFirstName: giftee.firstName,
        groupId: giftee.groupId,
        groupName: giftee.groupName,
        dateMatched: new Date().toISOString(),
      });
    }
  }

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
});

// Utility to group members by a key (e.g., groupId)
function groupBy(array, key) {
  return array.reduce((result, current) => {
    (result[current[key]] = result[current[key]] || []).push(current);
    return result;
  }, {});
}

// Utility to shuffle an array (Fisher-Yates shuffle)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}



app.get('/generate_members', (req, res) => {
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
    res.json(people);
});

app.get('/healthcheck', (req, res) => {
  res.send('Health Check');
});

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
