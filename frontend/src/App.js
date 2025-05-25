import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';

const WS_URL = 'https://swyftin-project.onrender.com';
const API_URL = 'https://swyftin-project.onrender.com/messages';

// Maximum number of reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 5;
// Base delay for exponential backoff (in ms)
const BASE_RECONNECT_DELAY = 1000;

function App() {
  const [messages, setMessages] = useState([]);
  const [user, setUser] = useState('User' + Math.floor(Math.random() * 1000));
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const ws = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const pendingMessageRef = useRef(null);

  // Function to calculate exponential backoff delay
  const getReconnectDelay = () => {
    return Math.min(
      30000, // Maximum delay of 30 seconds
      BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current)
    );
  };

  const connectWebSocket = useCallback(() => {
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
      return; // Already connected or connecting
    }

    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus('connecting');
    
    try {
      // Close existing connection if any
      if (ws.current) {
        ws.current.close();
      }

      ws.current = new WebSocket(WS_URL);

      ws.current.onopen = () => {
        setConnectionStatus('connected');
        console.log('WebSocket connected');
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts
        
        // Send any pending message
        if (pendingMessageRef.current) {
          ws.current.send(JSON.stringify(pendingMessageRef.current));
          pendingMessageRef.current = null;
        }
      };
      
      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'init') setMessages(data.messages);
          if (data.type === 'create') setMessages(msgs => [...msgs, data.message]);
          if (data.type === 'update') setMessages(msgs => msgs.map(m => m.id === data.message.id ? data.message : m));
          if (data.type === 'delete') setMessages(msgs => msgs.filter(m => m.id !== data.id));
        } catch (error) {
          console.error('Error parsing message:', error, event.data);
        }
      };
      
      ws.current.onclose = (event) => {
        setConnectionStatus('disconnected');
        console.log(`WebSocket closed with code ${event.code}, reason: ${event.reason}`);
        
        // Don't attempt to reconnect if closed normally or max attempts reached
        if (event.code === 1000 || reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setConnectionStatus('failed');
            console.error('Maximum reconnection attempts reached. Connection failed.');
          }
          return;
        }
        
        // Try to reconnect with exponential backoff
        reconnectAttemptsRef.current++;
        const delay = getReconnectDelay();
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      };
      
      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Don't call ws.close() here, as it will be handled by onclose
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setConnectionStatus('error');
      
      // Try to reconnect with exponential backoff
      reconnectAttemptsRef.current++;
      if (reconnectAttemptsRef.current <= MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay();
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      } else {
        setConnectionStatus('failed');
        console.error('Maximum reconnection attempts reached. Connection failed.');
      }
    }
  }, []);

  // Function to safely send websocket messages
  const sendWebSocketMessage = useCallback((message) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    } else {
      console.log('Connection not ready, reconnecting...');
      pendingMessageRef.current = message; // Store message to send after reconnection
      if (connectionStatus !== 'connecting') {
        connectWebSocket(); // Only try to reconnect if not already connecting
      }
      return false;
    }
  }, [connectionStatus, connectWebSocket]);

  useEffect(() => {
    connectWebSocket();
    
    // Load initial messages via HTTP if WebSocket connection fails
    if (messages.length === 0) {
      fetch(API_URL)
        .then(response => response.json())
        .then(data => {
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          }
        })
        .catch(err => console.error('Error fetching initial messages:', err));
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connectWebSocket]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    const message = { type: 'create', user, text };
    const sent = sendWebSocketMessage(message);
    
    if (sent) {
      setText('');
    }
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditingText(msg.text);
  };

  const saveEdit = (id) => {
    const message = { type: 'update', id, text: editingText };
    const sent = sendWebSocketMessage(message);
    
    if (sent) {
      setEditingId(null);
      setEditingText('');
    }
  };

  const deleteMsg = (id) => {
    sendWebSocketMessage({ type: 'delete', id });
  };

  // Helper function to get connection status text and color
  const getConnectionStatusInfo = () => {
    switch (connectionStatus) {
      case 'connected':
        return { text: 'Connected', color: 'green' };
      case 'connecting':
        return { text: 'Connecting...', color: 'orange' };
      case 'failed':
        return { text: 'Connection Failed', color: 'red' };
      default:
        return { text: 'Reconnecting...', color: 'red' };
    }
  };

  const statusInfo = getConnectionStatusInfo();

  return (
    <div className="App" style={{ maxWidth: 500, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>WhatsApp-like Chat</h2>
      <div style={{ marginBottom: 10 }}>
        <b>Your name:</b> <input value={user} onChange={e => setUser(e.target.value)} style={{ width: 120 }} />
        <span style={{ marginLeft: 10, color: statusInfo.color }}>
          {statusInfo.text}
        </span>
        {connectionStatus === 'failed' && (
          <button 
            onClick={() => {
              reconnectAttemptsRef.current = 0;
              connectWebSocket();
            }}
            style={{ marginLeft: 10 }}
          >
            Try Again
          </button>
        )}
      </div>
      <div style={{ border: '1px solid #ccc', minHeight: 300, padding: 10, background: '#fafafa', marginBottom: 10, overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>No messages yet</div>
        ) : (
          messages.map(msg => (
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
          ))
        )}
      </div>
      <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={connectionStatus !== 'connected'}>Send</button>
      </form>
    </div>
  );
}

export default App;
