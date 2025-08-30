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
            <th>Email</th>
            <th>Member ID</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    if (members.length === 0) {
      html += '<tr><td colspan="5">No members found</td></tr>';
    } else {
      members.forEach(member => {
        // Format phone number
        let formattedPhone = member.phoneNumber;
        if (formattedPhone && formattedPhone.length === 10) {
          formattedPhone = `(${formattedPhone.substring(0, 3)}) ${formattedPhone.substring(3, 6)}-${formattedPhone.substring(6)}`;
        }
        
        html += `
          <tr>
            <td>
              <div class="member-info">
                <strong>${member.firstName} ${member.lastName}</strong>
              </div>
            </td>
            <td>
              ${member.phoneNumber ? formattedPhone : '<span class="text-muted">No phone</span>'}
            </td>
            <td>
              ${member.email || '<span class="text-muted">No email</span>'}
            </td>
            <td>
              <div class="guid-display">
                <code>${member._id}</code>
                <button class="btn btn-sm btn-info" 
                        onclick="copyGuid('${member._id}')" 
                        title="Copy Member ID">
                  📋
                </button>
              </div>
            </td>
            <td>
              <div class="member-actions">
                <button class="btn btn-sm" 
                        hx-get="/partials/member-form?id=${member._id}" 
                        hx-target="#member-form-container"
                        hx-swap="innerHTML">Edit</button>
                <button class="btn btn-sm btn-danger" 
                        hx-delete="/api/proxy/members/${member._id}" 
                        hx-confirm="Are you sure you want to delete this member?"
                        hx-target="#members-list"
                        hx-swap="innerHTML">Delete</button>
              </div>
            </td>
          </tr>
        `;
      });
    }
    
    html += `
        </tbody>
      </table>
      
      <style>
        .guid-display {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .guid-display code {
          font-family: monospace;
          font-size: 11px;
          color: #666;
          background-color: #f8f9fa;
          padding: 2px 4px;
          border-radius: 3px;
          border: 1px solid #ddd;
        }
        .member-actions {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }
        .text-muted {
          color: #6c757d;
          font-style: italic;
        }
        .member-info {
          font-weight: 500;
        }
      </style>
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
            <th>Group ID</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    if (groups.length === 0) {
      html += '<tr><td colspan="6">No groups found</td></tr>';
    } else {
      groups.forEach(group => {
        html += `
          <tr>
            <td>
              <div class="group-info">
                <strong>${group.name}</strong>
              </div>
            </td>
            <td>${group.year}</td>
            <td>${group.members.length} members</td>
            <td>
              <span class="badge ${group.archived ? 'badge-secondary' : 'badge-success'}">
                ${group.archived ? 'Archived' : 'Active'}
              </span>
            </td>
            <td>
              <div class="guid-display">
                <code>${group._id}</code>
                <button class="btn btn-sm btn-info" 
                        onclick="copyGuid('${group._id}')" 
                        title="Copy Group ID">
                  📋
                </button>
              </div>
            </td>
            <td>
              <div class="group-actions">
                <button class="btn btn-sm" 
                        hx-get="/partials/group-form?id=${group._id}" 
                        hx-target="#group-form-container"
                        hx-swap="innerHTML">Edit</button>
                <button class="btn btn-sm btn-danger" 
                        hx-delete="/api/proxy/group/${group._id}" 
                        hx-confirm="Are you sure you want to delete this group?"
                        hx-target="#groups-list"
                        hx-swap="innerHTML">Delete</button>
                ${!group.archived ? `
                <button class="btn btn-sm btn-success" 
                        hx-post="/api/proxy/match/${group._id}" 
                        hx-target="#groups-list"
                        hx-swap="innerHTML"
                        hx-confirm="Generate new matches for this group?">Generate Matches</button>
                <button class="btn btn-sm btn-info" 
                        hx-post="/api/proxy/match/email-notification/${group._id}" 
                        hx-target="#groups-list"
                        hx-swap="innerHTML"
                        hx-confirm="Send email notifications to all Secret Santas?">Email Notify</button>
                <button class="btn btn-sm btn-info" 
                        hx-post="/api/proxy/match/notification/${group._id}" 
                        hx-target="#groups-list"
                        hx-swap="innerHTML"
                        hx-confirm="Send SMS notifications to all Secret Santas?">SMS Notify</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      });
    }
    
    html += `
        </tbody>
      </table>
      
      <style>
        .badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .badge-success {
          background-color: #28a745;
          color: white;
        }
        .badge-secondary {
          background-color: #6c757d;
          color: white;
        }
        .guid-display {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .guid-display code {
          font-size: 11px;
          color: #666;
          background-color: #f8f9fa;
          padding: 2px 4px;
          border-radius: 3px;
          border: 1px solid #ddd;
        }
        .group-actions {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }
      </style>
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
            fetch('/api/proxy/group')
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
          fetch('/api/proxy/group')
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
            <label for="email">Email (Optional)</label>
            <input type="email" id="email" name="email" class="form-control" value="${member ? member.email : ''}">
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

// Group form
app.get('/partials/group-form', async (req, res) => {
  try {
    const groupId = req.query.id;
    let group = null;
    let allMembers = [];
    
    if (groupId) {
      // Fetch group data from API
      const groupResponse = await axios.get(`${API_URL}/groups/${groupId}`);
      group = groupResponse.data;
    }
    
    // Fetch all members for the member selection
    const membersResponse = await axios.get(`${API_URL}/members`);
    allMembers = membersResponse.data;
    
    const html = `
      <div class="panel">
        <h3>${group ? 'Edit' : 'Create'} Group</h3>
        
        ${group ? `
        <div class="group-id-info" style="margin-bottom: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 4px; border: 1px solid #ddd;">
          <strong>Group ID:</strong>
          <div class="guid-display">
            <code>${group._id}</code>
            <button class="btn btn-sm btn-info" 
                    onclick="copyGuid('${group._id}')" 
                    title="Copy Group ID">
              📋 Copy
            </button>
          </div>
        </div>
        ` : ''}
        
        <form method="POST" ${group ? 
          `hx-put="/api/proxy/group/${group._id}"` : 
          'hx-post="/api/proxy/group"'
        }
              hx-target="#groups-list"
              hx-swap="innerHTML"
              hx-trigger="submit"
              hx-on::after-request="console.log('Form submitted:', event.detail)"
              hx-on::response-error="console.error('Response error:', event.detail)">
          
          <div class="form-group">
            <label for="name">Group Names</label>
            <input type="text" id="name" name="name" class="form-control" value="${group ? group.name : ''}" required>
          </div>
          
          <div class="form-group">
            <label for="year">Year</label>
            <input type="text" id="year" name="year" class="form-control" value="${group ? group.year : '2025'}" required>
          </div>
          
          <div class="form-group">
            <label>Select Members</label>
            <div class="member-select">
              ${allMembers.map(member => `
                <div class="member-item">
                  <label>
                    <input type="checkbox" name="members[]" value="${member._id}" 
                          ${group && group.members && group.members.some(m => m._id === member._id) ? 'checked' : ''}>
                    ${member.firstName} ${member.lastName}
                    <span class="member-id">(ID: ${member._id})</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="form-group">
            <button type="submit" class="btn btn-success">Save Group</button>
            <button type="button" class="btn" onclick="document.getElementById('group-form-container').innerHTML = ''">Cancel</button>
          </div>
        </form>
      </div>
      
      <style>
        .guid-display {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 5px;
        }
        .guid-display code {
          font-family: monospace;
          font-size: 12px;
          color: #666;
          background-color: #e9ecef;
          padding: 4px 8px;
          border-radius: 3px;
          border: 1px solid #ddd;
        }
        .member-id {
          font-size: 11px;
          color: #666;
          font-family: monospace;
        }
        .member-select {
          height: 150px;
          overflow-y: auto;
          border: 1px solid #ddd;
          padding: 10px;
          border-radius: 4px;
        }
        .member-item {
          padding: 5px;
          margin-bottom: 5px;
          border-bottom: 1px solid #eee;
        }
      </style>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error loading group form:', error);
    res.status(500).send(`
      <div class="panel">
        <h3>Error</h3>
        <p>Failed to load group form: ${error.message}</p>
        <button class="btn" onclick="document.getElementById('group-form-container').innerHTML = ''">Close</button>
      </div>
    `);
  }
});

// Test endpoint to debug API responses
app.get('/debug/api-test', async (req, res) => {
  try {
    console.log('Testing API connection...');
    const response = await axios.get(`${API_URL}/groups`);
    console.log('API Response:', response.data);
    res.json({
      success: true,
      message: 'API connection successful',
      data: response.data,
      status: response.status
    });
  } catch (error) {
    console.error('API Test Error:', error);
    res.status(500).json({
      success: false,
      message: 'API connection failed',
      error: error.message,
      status: error.response?.status || 'unknown'
    });
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
    // After successful proxy request to API, handle HTMX responses properly
    if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') && 
        proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
      
      // For HTMX requests, don't redirect, just return success
      if (req.headers['hx-request']) {
        // Remove any redirect headers that might cause issues
        delete proxyRes.headers['hx-redirect'];
        delete proxyRes.headers['location'];
        
        // Set content type to ensure proper HTMX handling
        proxyRes.headers['content-type'] = 'application/json';
      }
    }
  },
  onError: function(err, req, res) {
    console.error('Proxy error:', err);
    if (req.headers['hx-request']) {
      res.status(500).send(`
        <div class="alert alert-danger">
          <h4>Proxy Error</h4>
          <p>${err.message || 'An error occurred while processing your request'}</p>
        </div>
      `);
    } else {
      res.status(500).send('Proxy Error: ' + err.message);
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