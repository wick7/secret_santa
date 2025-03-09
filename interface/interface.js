const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API base URL - Use the service name 'main' instead of localhost
// This is how Docker Compose networking works - containers talk to each other using service names
const API_URL = 'http://main:3000/api';
const BROWSER_API_URL = '/api/proxy'; // Client-side requests should use the proxy path

// Main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// ===== HTML GENERATORS FOR API DATA =====

// Members list HTML
app.get('/partials/members-list', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}/members`);
    const members = response.data;
    
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
                      hx-delete="/api/proxy/members/${member._id}" 
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
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).send(`
      <div class="error-message">
        <h3>Error loading members</h3>
        <p>${error.message}</p>
        <button class="btn btn-sm" hx-get="/partials/members-list" hx-target="#members-list">Try Again</button>
      </div>
    `);
  }
});

// Groups list HTML
app.get('/partials/groups-list', async (req, res) => {
  try {
    const response = await axios.get(`${API_URL}/groups`);
    const groups = response.data;
    
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
                      hx-delete="/api/proxy/groups/${group._id}" 
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
    console.error('Error fetching groups:', error);
    res.status(500).send(`
      <div class="error-message">
        <h3>Error loading groups</h3>
        <p>${error.message}</p>
        <button class="btn btn-sm" hx-get="/partials/groups-list" hx-target="#groups-list">Try Again</button>
      </div>
    `);
  }
});

// Matches list HTML
app.get('/partials/matches-list', async (req, res) => {
  try {
    // Get groupId from query parameter, or use a default if not provided
    const groupId = req.query.groupId;
    
    if (!groupId) {
      return res.send(`
        <div>
          <p>Please select a group to view matches</p>
          <select id="group-selector" class="form-control" 
                  hx-get="/partials/matches-list" 
                  hx-target="#matches-list" 
                  hx-trigger="change" 
                  hx-include="[name='includeArchived']">
            <option value="">Select a group</option>
            <!-- Group options will be populated via JavaScript -->
          </select>
          <div class="form-check mt-2">
            <input type="checkbox" class="form-check-input" id="includeArchived" name="includeArchived" value="true"
                   hx-get="/partials/matches-list" 
                   hx-target="#matches-list" 
                   hx-trigger="change" 
                   hx-include="#group-selector">
            <label class="form-check-label" for="includeArchived">Include archived matches</label>
          </div>
          
          <script>
            // Fetch groups and populate dropdown
            fetch('/api/proxy/groups')
              .then(response => response.json())
              .then(groups => {
                const selector = document.getElementById('group-selector');
                groups.forEach(group => {
                  const option = document.createElement('option');
                  option.value = group._id;
                  option.textContent = group.name + ' (' + group.year + ')';
                  selector.appendChild(option);
                });
              })
              .catch(error => console.error('Error loading groups:', error));
          </script>
        </div>
      `);
    }
    
    // Include archived parameter
    const includeArchived = req.query.includeArchived === 'true';
    
    // Fetch matches for the selected group
    const response = await axios.get(`${API_URL}/matches?groupId=${groupId}&includeArchived=${includeArchived}`);
    const matchesHtml = response.data;
    
    // Add back the group selector above the matches
    const html = `
      <div>
        <select id="group-selector" class="form-control mb-3" 
                hx-get="/partials/matches-list" 
                hx-target="#matches-list" 
                hx-trigger="change"
                hx-include="[name='includeArchived']">
          <option value="">Select a group</option>
          <!-- Group options will be populated via JavaScript -->
        </select>
        
        <div class="form-check mb-3">
          <input type="checkbox" class="form-check-input" id="includeArchived" name="includeArchived" value="true"
                 ${includeArchived ? 'checked' : ''}
                 hx-get="/partials/matches-list" 
                 hx-target="#matches-list" 
                 hx-trigger="change"
                 hx-include="#group-selector">
          <label class="form-check-label" for="includeArchived">Include archived matches</label>
        </div>
        
        <button class="btn btn-primary mb-3"
                hx-post="/api/proxy/match/${groupId}"
                hx-target="#matches-list"
                hx-confirm="This will create new matches for the selected group. Continue?">
          Generate New Matches
        </button>
        
        <div class="match-results">
          ${matchesHtml}
        </div>
        
        <script>
          // Fetch groups and populate dropdown
          fetch('/api/proxy/groups')
            .then(response => response.json())
            .then(groups => {
              const selector = document.getElementById('group-selector');
              groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group._id;
                option.textContent = group.name + ' (' + group.year + ')';
                if (group._id === '${groupId}') {
                  option.selected = true;
                }
                selector.appendChild(option);
              });
            })
            .catch(error => console.error('Error loading groups:', error));
        </script>
      </div>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).send(`
      <div class="error-message">
        <h3>Error loading matches</h3>
        <p>${error.message}</p>
        <button class="btn btn-sm" hx-get="/partials/matches-list" hx-target="#matches-list">Try Again</button>
      </div>
    `);
  }
});

// Member form
app.get('/partials/member-form', async (req, res) => {
  try {
    const memberId = req.query.id;
    let member = null;
    
    if (memberId) {
      // Fetch member data from API
      const response = await axios.get(`${API_URL}/members/${memberId}`);
      member = response.data;
    }
    
    const html = `
      <div class="panel">
        <h3>${member ? 'Edit' : 'Add'} Member</h3>
        
        <form ${member ? 
          `hx-put="/api/proxy/members/${member._id}"` : 
          'hx-post="/api/proxy/members"'
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
    console.error('Error loading member form:', error);
    res.status(500).send(`
      <div class="panel">
        <h3>Error</h3>
        <p>Failed to load member form: ${error.message}</p>
        <button class="btn" onclick="document.getElementById('member-form-container').innerHTML = ''">Close</button>
      </div>
    `);
  }
});

// ===== API PROXIES =====

// Create a proxy for API requests
app.use('/api/proxy', createProxyMiddleware({
  target: 'http://main:3000', // Use Docker service name
  pathRewrite: {
    '^/api/proxy': '/api' // Remove the /proxy part when forwarding
  },
  changeOrigin: true,
  onProxyRes: function(proxyRes, req, res) {
    // After successful proxy request to API, redirect to relevant view
    if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') && 
        proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
      
      // Check which entity was affected to determine where to redirect
      const path = req.path;
      if (path.includes('/members')) {
        proxyRes.headers['hx-redirect'] = '/partials/members-list';
      } else if (path.includes('/groups')) {
        proxyRes.headers['hx-redirect'] = '/partials/groups-list';
      } else if (path.includes('/matches')) {
        proxyRes.headers['hx-redirect'] = '/partials/matches-list';
      }
    }
  }
}));

// Helper function to display errors in HTMX-friendly format
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  // Check if it's an HTMX request
  if (req.headers['hx-request']) {
    res.status(500).send(`
      <div class="alert alert-danger">
        <h4>Error</h4>
        <p>${err.message || 'An unknown error occurred'}</p>
      </div>
    `);
  } else {
    next(err);
  }
});

app.listen(port, () => {
  console.log(`Interface server running on port ${port}`);
});