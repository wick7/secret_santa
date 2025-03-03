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
const API_URL = 'http://main:3000/api';

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
app.get('/partials/member-form', async (req, res) => {
  try {
    const memberId = req.query.id;
    let member = null;
    
    if (memberId) {
      // Fetch the member from the API if we're editing
      const response = await axios.get(`${API_URL}/members/${memberId}`);
      member = response.data;
    }
    
    // Serve the appropriate form with member data if available
    res.sendFile(path.join(__dirname, 'views', 'partials', 'member-form.html'));
    // In a real implementation, you'd need to process the template to include member data
  } catch (error) {
    res.status(500).send(`<div>Error: ${error.message}</div>`);
  }
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