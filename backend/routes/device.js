const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/deviceController');

// GET  /device/status            — connection state + latest reading
router.get('/status', ctrl.getStatus);

// POST /device/connect           — record connect / disconnect event
router.post('/connect', ctrl.connect);

// GET  /device/history           — paginated history database records
router.get('/history', ctrl.getHistory);

// DELETE /device/all             — wipe ALL records from the database
router.delete('/all', ctrl.deleteAllData);

// ─── CRUD operations on /device ──────────────────────────────────────────────

// GET  /device?deviceId=X        — paginated history for a device (or all devices if deviceId is omitted)
router.get('/', ctrl.getData);

// POST /device                   — save a real device reading (Postman / BLE)
router.post('/', ctrl.postData);

// PUT  /device                   — update a device reading by ID or latest by deviceId
router.put('/', ctrl.putData);

// DELETE /device?deviceId=X      — wipe readings for a device, or a specific reading by ID
router.delete('/', ctrl.deleteData);

module.exports = router;
