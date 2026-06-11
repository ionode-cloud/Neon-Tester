const mongoose = require('mongoose');

const deviceDataSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    tiltAngle: {
      type: Number,
      required: true,
      min: 0,
      max: 90,
    },
    height: {
      type: Number,
      required: true,
      min: 0,
    },
    voltageStatus: {
      type: Boolean,
      required: true,
      default: false,
    },
    batterySOC: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    latitude: {
      type: Number,
      required: false,
    },
    longitude: {
      type: Number,
      required: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'device_readings',
    timestamps: false,
  }
);

// Compound index for efficient per-device time queries
deviceDataSchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model('DeviceData', deviceDataSchema);
