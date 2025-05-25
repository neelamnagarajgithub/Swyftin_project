const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors(
  {
    origin: '*', // Adjust this to your frontend's URL
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
  }
));
app.use(express.json());

let messages = [];
let nextId = 1;

// REST API for CRUD (for fallback/testing)
app.get('/messages', (req, res) => {
  res.json(messages);
});

app.post('/messages', (req, res) => {
  const { user, text } = req.body;
  const message = { id: nextId++, user, text, timestamp: Date.now() };
  messages.push(message);
  broadcast({ type: 'create', message });
  res.status(201).json(message);
});

app.put('/messages/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { text } = req.body;
  const message = messages.find(m => m.id === id);
  if (message) {
    message.text = text;
    broadcast({ type: 'update', message });
    res.json(message);
  } else {
    res.status(404).json({ error: 'Message not found' });
  }
});

app.delete('/messages/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = messages.findIndex(m => m.id === id);
  if (index !== -1) {
    const [deleted] = messages.splice(index, 1);
    broadcast({ type: 'delete', id });
    res.json(deleted);
  } else {
    res.status(404).json({ error: 'Message not found' });
  }
});

// WebSocket events
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'init', messages }));

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'create') {
        const message = { id: nextId++, user: data.user, text: data.text, timestamp: Date.now() };
        messages.push(message);
        broadcast({ type: 'create', message });
      } else if (data.type === 'update') {
        const message = messages.find(m => m.id === data.id);
        if (message) {
          message.text = data.text;
          broadcast({ type: 'update', message });
        }
      } else if (data.type === 'delete') {
        const index = messages.findIndex(m => m.id === data.id);
        if (index !== -1) {
          messages.splice(index, 1);
          broadcast({ type: 'delete', id: data.id });
        }
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
}); 