const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: { origin: "*" }
});

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Store all connected users
const users = new Map();

// Store drawing history for new users
let drawingHistory = [];

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Assign a unique color to the user
  const userColor = generateColor();
  const username = `User${users.size + 1}`;
  
  users.set(socket.id, {
    id: socket.id,
    color: userColor,
    username: username,
    cursorX: 0,
    cursorY: 0
  });

  // Send current drawing state to the new user
  socket.emit('loadDrawingHistory', drawingHistory);
  
  // Broadcast updated user list to all clients
  broadcastUserList();

  // Handle drawing events
  socket.on('draw', (data) => {
    const command = {
      type: 'draw',
      userId: socket.id,
      userColor: users.get(socket.id).color,
      x1: data.x1,
      y1: data.y1,
      x2: data.x2,
      y2: data.y2,
      strokeWidth: data.strokeWidth,
      timestamp: Date.now()
    };
    
    // Add to history
    drawingHistory.push(command);
    
    // Broadcast to all OTHER clients (sender already drew locally)
    socket.broadcast.emit('draw', command);
  });

  // Handle erase events
  socket.on('erase', (data) => {
    const command = {
      type: 'erase',
      userId: socket.id,
      x: data.x,
      y: data.y,
      radius: data.radius,
      timestamp: Date.now()
    };
    
    drawingHistory.push(command);
    socket.broadcast.emit('erase', command);
  });

  // Handle cursor movement
  socket.on('cursorMove', (data) => {
    if (users.has(socket.id)) {
      const user = users.get(socket.id);
      user.cursorX = data.x;
      user.cursorY = data.y;
      
      // Broadcast cursor position to other clients
      socket.broadcast.emit('cursorUpdate', {
        userId: socket.id,
        username: user.username,
        x: data.x,
        y: data.y,
        color: user.color
      });
    }
  });

  // Handle undo command
  socket.on('undo', (data) => {
    // Find and remove the last action by this user
    const lastUserActionIndex = findLastUserAction(socket.id);
    
    if (lastUserActionIndex !== -1) {
      // Remove the action from history
      drawingHistory.splice(lastUserActionIndex, 1);
      
      // Broadcast undo to all clients (they will redraw everything)
      io.emit('undoAction', {
        userId: socket.id,
        previousHistory: drawingHistory
      });
    }
  });

  // Handle redo command (not fully implemented in basic version)
  socket.on('redo', (data) => {
    console.log('Redo not fully implemented in collaborative mode');
  });

  // Handle clear canvas
  socket.on('clearCanvas', () => {
    drawingHistory = [];
    io.emit('canvasCleared');
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    users.delete(socket.id);
    
    // Remove cursor from UI
    io.emit('cursorRemoved', { userId: socket.id });
    
    // Update user list
    broadcastUserList();
  });
});

// ===== Helper Functions =====

function generateColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F06292', '#AB47BC', '#7E57C2', '#5C6BC0'
  ];
  return colors[users.size % colors.length];
}

function broadcastUserList() {
  const userList = Array.from(users.values()).map(u => ({
    id: u.id,
    username: u.username,
    color: u.color
  }));
  
  // Send to all connected clients
  io.emit('userListUpdate', userList);
}

function findLastUserAction(userId) {
  // Search from end of history backwards to find last action by this user
  for (let i = drawingHistory.length - 1; i >= 0; i--) {
    if (drawingHistory[i].userId === userId) {
      return i;
    }
  }
  return -1;
}

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🎨 Collaborative Drawing Server running on port ${PORT}`);
  console.log(`📍 Open http://localhost:${PORT} in your browser`);
});