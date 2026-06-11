require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const deviceRoutes = require('./routes/device');
const ctrl = require('./controllers/deviceController');

// ─── App Setup ─────────
const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

// ─── Middleware ────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(express.json());

// ─── Routes ───────────
app.use('/device', deviceRoutes);

// Support both /health and /api/health
const healthHandler = (req, res) =>
  res.json({
    status: 'ok',
    timestamp: new Date(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ─── MongoDB ───────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('[DB] MongoDB Atlas connected ✓'))
  .catch((err) => console.error('[DB] Connection error:', err.message));

mongoose.connection.on('disconnected', () => console.warn('[DB] MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => console.log('[DB] MongoDB reconnected ✓'));

// ─── Socket.IO ─────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Send current state to newly connected client
  socket.emit('connectionStatus', ctrl.getConnectionState());
  socket.emit('connectionLog',    ctrl.getConnectionLog().slice(0, 20));

  // ── Real Bluetooth data from frontend ──────────────────────────────────────
  // This data comes from the Web Bluetooth API on the client side.
  // It is saved to MongoDB and broadcast to all other clients.
  socket.on('bluetoothData', async (payload) => {
    try {
      const DeviceData = require('./models/DeviceData');
      const reading = new DeviceData({
        deviceId:      payload.deviceId || ctrl.getConnectionState().deviceId || 'ble_device',
        tiltAngle:     payload.tiltAngle,
        height:        payload.height,
        voltageStatus: payload.voltageStatus,
        batterySOC:    payload.batterySOC,
        latitude:      (payload.latitude !== undefined && payload.latitude !== null) ? parseFloat(payload.latitude) : undefined,
        longitude:     (payload.longitude !== undefined && payload.longitude !== null) ? parseFloat(payload.longitude) : undefined,
        timestamp:     payload.timestamp || new Date(),
      });
      if (mongoose.connection.readyState === 1) {
        await reading.save();
      }
      io.emit('deviceData', { ...reading.toObject(), source: 'bluetooth' });
    } catch (err) {
      console.error('[WS] bluetoothData save error:', err.message);
    }
  });

  // ── Device connect / disconnect events ─────────────────────────────────────
  socket.on('deviceConnected', (info) => {
    const state = ctrl.getConnectionState();
    Object.assign(state, {
      connected: true,
      deviceName: info.deviceName,
      deviceId: info.deviceId,
      connectedAt: new Date(),
      lastSeen: new Date(),
    });
    ctrl.addConnectionLog({
      type: 'connect',
      message: `🟢 Device "${info.deviceName}" connected`,
      timestamp: new Date(),
    });
    io.emit('connectionStatus', ctrl.getConnectionState());
    io.emit('connectionLog',    ctrl.getConnectionLog().slice(0, 20));
  });

  socket.on('deviceDisconnected', (info) => {
    const state = ctrl.getConnectionState();
    Object.assign(state, { connected: false, lastSeen: new Date() });
    ctrl.addConnectionLog({
      type: 'disconnect',
      message: `🔴 Device "${info.deviceName || 'device'}" disconnected`,
      timestamp: new Date(),
    });
    io.emit('connectionStatus', ctrl.getConnectionState());
    io.emit('connectionLog',    ctrl.getConnectionLog().slice(0, 20));
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});



// ─── Start ─────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  console.log(`[SERVER] Socket.IO ready`);
  console.log(`[SERVER] Connecting to MongoDB Atlas…`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[SERVER] Port ${PORT} in use — retrying in 1s…`);
    setTimeout(() => {
      httpServer.close();
      httpServer.listen(PORT);
    }, 1000);
  } else {
    console.error('[SERVER] Error:', err);
  }
});
