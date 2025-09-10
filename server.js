const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// serve static files (index.html must be in same folder as server.js)
app.use(express.static(path.join(__dirname)));

// Track current state for each room
const roomStates = {};

io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);

  // Create room
  socket.on('create-room', (roomId) => {
    socket.join(roomId);
    const users = io.sockets.adapter.rooms.get(roomId)?.size || 1;
    console.log(`📂 Room created: ${roomId} by ${socket.id}`);

    // initialize empty state
    roomStates[roomId] = null;

    io.to(roomId).emit('room-created', { roomId, users });
  });

  // Join room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    const users = io.sockets.adapter.rooms.get(roomId)?.size || 1;
    console.log(`👥 ${socket.id} joined room: ${roomId}`);
    io.to(roomId).emit('room-joined', { roomId, users });

    // if there’s an active song, send it only to the new user
    if (roomStates[roomId]) {
      socket.emit('play-song', roomStates[roomId]);
    }
  });

  // Sync playback state (pause/play/seek)
  socket.on('sync-state', (data) => {
    if (roomStates[data.room]) {
      // update time & state in room
      roomStates[data.room].state = data.state;
      roomStates[data.room].time = data.time;
    }
    socket.to(data.room).emit('sync-state', data);
  });

  // Play a song
  socket.on('play-song', (data) => {
    if (!roomStates[data.room]) roomStates[data.room] = {};

    const startAt = Date.now() + 2000; // give everyone 2s preload time

    roomStates[data.room] = {
      videoId: data.videoId,
      title: data.title,
      channel: data.channel,
      state: 'playing',
      time: 0,
      startAt
    };

    // send to everyone else in room
    socket.to(data.room).emit('play-song', { ...roomStates[data.room] });
  });

  // Controls (pause/play/seek)
  socket.on('control-action', (data) => {
    if (roomStates[data.room]) {
      if (data.action === 'seek') {
        roomStates[data.room].time = data.time;
      } else if (data.action === 'pause') {
        roomStates[data.room].state = 'paused';
      } else if (data.action === 'play') {
        roomStates[data.room].state = 'playing';
      }
    }
    socket.to(data.room).emit('control-action', data);
  });

  // Handle disconnect
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        const users = io.sockets.adapter.rooms.get(room)?.size || 0;
        io.to(room).emit('user-left', { roomId: room, users });
      }
    }
    console.log('❌ Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
