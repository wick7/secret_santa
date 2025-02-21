const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('<h1>Interface</h1>');
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Interface is running at http://localhost:${port}`);
});