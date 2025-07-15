import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const rooms = {};

io.on('connection', socket => {
  socket.on('join-room', ({ roomId }) => {
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', { userId: socket.id });

    if (rooms[roomId].length === 2) {
      io.in(roomId).emit('ready', { roomId });
    }
  });
   socket.on('signal', ({ roomId, data }) => {
    socket.to(roomId).emit('signal', { userId: socket.id, data });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      } else {
        socket.to(roomId).emit('user-left', { userId: socket.id });
      }
    }
  });
});

server.listen(5000, () => console.log('Server running on port 5000'));
