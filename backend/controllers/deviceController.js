const mongoose = require('mongoose');
const DeviceData = require('../models/DeviceData');

// ─── In-memory connection state ──────────────────────────────────────────────
let connectionState = {
  connected: false,
  deviceName: null,
  deviceId: null,
  connectedAt: null,
  lastSeen: null,
};

let connectionLog = [];

// ─── GET /api/device/status ──────────────────────────────────────────────────
exports.getStatus = async (req, res) => {
  try {
    const latestReading = await DeviceData.findOne()
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      success: true,
      status: connectionState,
      latestReading: latestReading || null,
      initialCommand: 'F',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /device ──────
// Returns only the latest reading object
exports.getData = async (req, res) => {
  try {
    const { deviceId } = req.query;
    const filter = deviceId ? { deviceId } : {};

    const latestReading = await DeviceData.findOne(filter)
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      latest: latestReading || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /device/history ──────────────────────────────────────────────────────
// Returns paginated history of device data
exports.getHistory = async (req, res) => {
  try {
    const { deviceId } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const filter = deviceId ? { deviceId } : {};

    const count = await DeviceData.countDocuments(filter);
    const data = await DeviceData.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /device ─────
// Save a real device reading (called from Postman or real BT device)
exports.postData = async (req, res) => {
  try {
    const { deviceId, tiltAngle, height, voltageStatus, batterySOC } = req.body;

    // Validate required fields
    const missing = [];
    if (!deviceId)               missing.push('deviceId');
    if (tiltAngle === undefined) missing.push('tiltAngle');
    if (height    === undefined) missing.push('height');
    if (voltageStatus === undefined) missing.push('voltageStatus');
    if (batterySOC === undefined) missing.push('batterySOC');

    if (missing.length) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
        example: {
          deviceId: 'device_001',
          tiltAngle: 45.2,
          height: 12.5,
          voltageStatus: true,
          batterySOC: 78,
        },
      });
    }

    // Range validation
    if (tiltAngle < 0 || tiltAngle > 90) {
      return res.status(400).json({ success: false, error: 'tiltAngle must be between 0 and 90' });
    }
    if (batterySOC < 0 || batterySOC > 100) {
      return res.status(400).json({ success: false, error: 'batterySOC must be between 0 and 100' });
    }

    const reading = new DeviceData({
      deviceId,
      tiltAngle:     parseFloat(tiltAngle),
      height:        parseFloat(height),
      voltageStatus: Boolean(voltageStatus),
      batterySOC:    parseFloat(batterySOC),
      timestamp:     new Date(),
    });

    await reading.save();

    // Broadcast the new reading to all Socket.IO clients
    const io = req.app.get('io');
    if (io) {
      io.emit('deviceData', { ...reading.toObject(), source: 'postman' });
    }

    // Update last-seen state
    connectionState.lastSeen = new Date();
    if (connectionState.deviceId === deviceId) {
      connectionState.connected = true;
    }

    res.status(201).json({
      success: true,
      message: 'Reading saved successfully',
      data: reading,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /device ──────
// Update an existing device reading by document ID (id/_id) or deviceId (latest reading)
exports.putData = async (req, res) => {
  try {
    const { id, _id, deviceId, tiltAngle, height, voltageStatus, batterySOC } = req.body;
    const targetId = id || _id || req.query.id || req.query._id;
    const targetDeviceId = deviceId || req.query.deviceId;

    let targetReading;

    if (targetId) {
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({ success: false, error: 'Invalid document ID format' });
      }
      targetReading = await DeviceData.findById(targetId);
    } else if (targetDeviceId) {
      targetReading = await DeviceData.findOne({ deviceId: targetDeviceId }).sort({ timestamp: -1 });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either id (_id) or deviceId parameter is required to identify the reading to update.',
      });
    }

    if (!targetReading) {
      return res.status(404).json({ success: false, error: 'Device reading not found' });
    }

    // Update fields if provided
    if (tiltAngle !== undefined) {
      const parsedTilt = parseFloat(tiltAngle);
      if (isNaN(parsedTilt) || parsedTilt < 0 || parsedTilt > 90) {
        return res.status(400).json({ success: false, error: 'tiltAngle must be a number between 0 and 90' });
      }
      targetReading.tiltAngle = parsedTilt;
    }

    if (height !== undefined) {
      const parsedHeight = parseFloat(height);
      if (isNaN(parsedHeight) || parsedHeight < 0) {
        return res.status(400).json({ success: false, error: 'height must be a positive number' });
      }
      targetReading.height = parsedHeight;
    }

    if (voltageStatus !== undefined) {
      targetReading.voltageStatus = Boolean(voltageStatus);
    }

    if (batterySOC !== undefined) {
      const parsedSOC = parseFloat(batterySOC);
      if (isNaN(parsedSOC) || parsedSOC < 0 || parsedSOC > 100) {
        return res.status(400).json({ success: false, error: 'batterySOC must be a number between 0 and 100' });
      }
      targetReading.batterySOC = parsedSOC;
    }

    await targetReading.save();

    res.json({
      success: true,
      message: 'Reading updated successfully',
      data: targetReading,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /device/connect ────────────────────────────────────────────────────
exports.connect = async (req, res) => {
  try {
    const { deviceName, deviceId, action } = req.body;

    if (action === 'disconnect') {
      connectionState = {
        ...connectionState,
        connected: false,
        lastSeen: new Date(),
      };
      connectionLog.unshift({
        type: 'disconnect',
        message: `Device "${connectionState.deviceName}" disconnected`,
        timestamp: new Date(),
      });
    } else {
      connectionState = {
        connected: true,
        deviceName: deviceName || 'Unknown Device',
        deviceId: deviceId || 'N/A',
        connectedAt: new Date(),
        lastSeen: new Date(),
      };
      connectionLog.unshift({
        type: 'connect',
        message: `Device "${deviceName}" connected — ID: ${deviceId}`,
        timestamp: new Date(),
      });
    }

    if (connectionLog.length > 100) connectionLog = connectionLog.slice(0, 100);

    res.json({ success: true, status: connectionState, initialCommand: 'F' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE /device ───
// Delete a specific reading by ID or all readings for a deviceId
exports.deleteData = async (req, res) => {
  try {
    const { id, _id, deviceId } = req.query;
    const targetId = id || _id;

    if (targetId) {
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({ success: false, error: 'Invalid document ID format' });
      }
      const result = await DeviceData.deleteOne({ _id: targetId });
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, error: 'Device reading not found' });
      }
      return res.json({ success: true, deleted: result.deletedCount, message: 'Reading deleted successfully' });
    }

    if (deviceId) {
      const result = await DeviceData.deleteMany({ deviceId });
      return res.json({ success: true, deleted: result.deletedCount, deviceId, message: 'All readings for device deleted successfully' });
    }

    return res.status(400).json({
      success: false,
      error: 'Either id (_id) or deviceId query parameter is required to delete data.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE /device/all ──────────────────────────────────────────────────────
// Wipe every record — used to clear test / temporary data
exports.deleteAllData = async (req, res) => {
  try {
    const result = await DeviceData.deleteMany({});
    return res.json({
      success: true,
      deleted: result.deletedCount,
      message: `All ${result.deletedCount} records deleted successfully`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


// ─── Helpers exported for server.js ──────────────────────────────────────────
exports.getConnectionState = () => connectionState;
exports.getConnectionLog   = () => connectionLog;
exports.addConnectionLog   = (entry) => {
  connectionLog.unshift(entry);
  if (connectionLog.length > 100) connectionLog = connectionLog.slice(0, 100);
};

// NOTE: generateSimulatedData is ONLY for Socket.IO broadcast to the frontend.
// Simulated data is NEVER saved to MongoDB.
let _tilt = 30, _height = 10, _battery = 78, _voltage = true;
exports.generateSimulatedData = () => {
  _tilt    = Math.max(0,   Math.min(90,  _tilt    + (Math.random() - 0.5) * 3));
  _height  = Math.max(0,   Math.min(50,  _height  + (Math.random() - 0.5) * 0.5));
  _battery = Math.max(0,   Math.min(100, _battery - Math.random() * 0.2));
  _voltage = Math.random() > 0.05;
  return {
    deviceId:      'simulated',
    tiltAngle:     parseFloat(_tilt.toFixed(2)),
    height:        parseFloat(_height.toFixed(2)),
    voltageStatus: _voltage,
    batterySOC:    parseFloat(_battery.toFixed(1)),
    timestamp:     new Date(),
    simulated:     true,
  };
};
