import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const WS_URL = 'ws://localhost:3001';
const API_URL = 'http://localhost:3001/messages';

function App() {
  const [messages, setMessages] = useState([]);
  const [user, setUser] = useState('User' + Math.floor(Math.random() * 1000));
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new window.WebSocket(WS_URL);
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'init') setMessages(data.messages);
      if (data.type === 'create') setMessages(msgs => [...msgs, data.message]);
      if (data.type === 'update') setMessages(msgs => msgs.map(m => m.id === data.message.id ? data.message : m));
      if (data.type === 'delete') setMessages(msgs => msgs.filter(m => m.id !== data.id));
    };
    return () => ws.current && ws.current.close();
  }, []);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    ws.current.send(JSON.stringify({ type: 'create', user, text }));
    setText('');
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditingText(msg.text);
  };

  const saveEdit = (id) => {
    ws.current.send(JSON.stringify({ type: 'update', id, text: editingText }));
    setEditingId(null);
    setEditingText('');
  };

  const deleteMsg = (id) => {
    ws.current.send(JSON.stringify({ type: 'delete', id }));
  };

  return (
    <div className="App" style={{ maxWidth: 500, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>WhatsApp-like Chat</h2>
      <div style={{ marginBottom: 10 }}>
        <b>Your name:</b> <input value={user} onChange={e => setUser(e.target.value)} style={{ width: 120 }} />
      </div>
      <div style={{ border: '1px solid #ccc', minHeight: 300, padding: 10, background: '#fafafa', marginBottom: 10 }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ marginBottom: 8, background: msg.user === user ? '#e0ffe0' : '#fff', padding: 6, borderRadius: 4 }}>
            <b>{msg.user}</b> <span style={{ color: '#888', fontSize: 12 }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
            {editingId === msg.id ? (
              <>
                <input value={editingText} onChange={e => setEditingText(e.target.value)} style={{ width: '60%' }} />
                <button onClick={() => saveEdit(msg.id)}>Save</button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ marginLeft: 8 }}>{msg.text}</span>
                {msg.user === user && (
                  <>
                    <button style={{ marginLeft: 8 }} onClick={() => startEdit(msg)}>Edit</button>
                    <button style={{ marginLeft: 4 }} onClick={() => deleteMsg(msg.id)}>Delete</button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1 }}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;
