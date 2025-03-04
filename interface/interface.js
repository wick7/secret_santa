const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
const axios = require('axios');

// Set up static file serving
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API base URL
const API_URL = 'http://localhost:3002/api';

// Main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Members list partial with data
app.get('/partials/members-list', async (req, res) => {
  try {
    // Fetch data from your API
    const response = await axios.get(`${API_URL}/members`);
    const members = response.data;
    
    // Read the template file
    const templatePath = path.join(__dirname, 'views', 'partials', 'members-list.html');
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // Simple template processing for {{#each members}}...{{/each}}
    if (members.length === 0) {
      template = template.replace(
        /{{#each members}}[\s\S]*?{{\/each}}/,
        '<tr><td colspan="3">No members found</td></tr>'
      );
    } else {
      const eachMatch = template.match(/{{#each members}}([\s\S]*?){{\/each}}/);
      if (eachMatch && eachMatch[1]) {
        const itemTemplate = eachMatch[1];
        
        const membersHtml = members.map(member => {
          return itemTemplate
            .replace(/{{firstName}}/g, member.firstName)
            .replace(/{{lastName}}/g, member.lastName)
            .replace(/{{phoneNumber}}/g, member.phoneNumber)
            .replace(/{{_id}}/g, member._id);
        }).join('');
        
        template = template.replace(
          /{{#each members}}[\s\S]*?{{\/each}}/,
          membersHtml
        );
      }
    }
    
    res.send(template);
  } catch (error) {
    res.status(500).send(`<div>Error: ${error.message}</div>`);
  }
});

// Member form partial with data (for editing)
// In interface/interface.js
app.get('/partials/member-form', async (req, res) => {
  const memberId = req.query.id;
  let member = null;
  
  if (memberId) {
    try {
      // Fetch member data from the API if editing
      const response = await axios.get(`http://localhost:3001/api/members/${memberId}`);
      member = response.data;
    } catch (error) {
      console.error('Error fetching member:', error);
    }
  }
  
  // Return HTML form (no Handlebars syntax)
  const html = `
    <div class="panel">
      <h3>${member ? 'Edit' : 'Add'} Member</h3>
      
      <form ${member ? 
        `hx-put="http://localhost:3001/api/members/${member._id}"` : 
        'hx-post="http://localhost:3001/api/members"'
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
});

// Similar endpoints for other partials

// Proxy endpoints to your API
app.post('/api/members', async (req, res) => {
  try {
    const response = await axios.post(`${API_URL}/members`, req.body);
    // After successful creation, return the updated list
    res.redirect('/partials/members-list');
  } catch (error) {
    res.status(500).send(`<div>Error: ${error.message}</div>`);
  }
});

app.put('/api/members/:id', async (req, res) => {
  try {
    const response = await axios.put(`${API_URL}/members/${req.params.id}`, req.body);
    // After successful update, return the updated list
    res.redirect('/partials/members-list');
  } catch (error) {
    res.status(500).send(`<div>Error: ${error.message}</div>`);
  }
});

app.delete('/api/members/:id', async (req, res) => {
  try {
    await axios.delete(`${API_URL}/members/${req.params.id}`);
    // After successful deletion, return the updated list
    res.redirect('/partials/members-list');
  } catch (error) {
    res.status(500).send(`<div>Error: ${error.message}</div>`);
  }
});

app.listen(port, () => {
  console.log(`Interface server running on port ${port}`);
});