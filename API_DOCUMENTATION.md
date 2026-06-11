# Neon Monitor — API Documentation

> **Base URL:** `http://localhost:5000`
> **Content-Type:** `application/json`
> **Database:** MongoDB Atlas — `Neon-tester` collection: `device_readings`

---

## Table of Contents

- [Health Check](#health-check)
- [POST /device](#post-device) ← **Main Postman endpoint**
- [GET /device](#get-device)
- [PUT /device](#put-device)
- [DELETE /device](#delete-device)
- [GET /device/status](#get-devicestatus)
- [POST /device/connect](#post-deviceconnect)
- [Socket.IO Events](#socketio-events)
- [Data Models](#data-models)
- [Error Responses](#error-responses)
- [Postman Quick Reference](#postman-quick-reference)

---

## Health Check

### `GET /health`

Returns server and database status. Supports both `/health` and `/api/health`.

**Request**
```http
GET http://localhost:5000/health
```

**Response `200 OK`**
```json
{
  "status": "ok",
  "timestamp": "2026-06-10T16:00:00.000Z",
  "db": "connected"
}
```

---

## POST /device

> ⭐ **Primary Postman endpoint** — saves a real device reading to MongoDB Atlas.

### `POST /device`

Saves one sensor reading scoped to a `deviceId`. All readings persisted here appear in the dashboard Data History table.

**Request**
```http
POST http://localhost:5000/device
Content-Type: application/json
```

**Body**
```json
{
  "deviceId": "device_001",
  "tiltAngle": 45.2,
  "height": 12.5,
  "voltageStatus": true,
  "batterySOC": 78.0,
  "latitude": 28.6139,
  "longitude": 77.2090
}
```

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `deviceId` | string | ✅ | non-empty | Unique device identifier |
| `tiltAngle` | number | ✅ | 0 – 90 | Tilt angle in degrees |
| `height` | number | ✅ | ≥ 0 | Height in metres |
| `voltageStatus` | boolean | ✅ | true / false | `true` = Active, `false` = Inactive |
| `batterySOC` | number | ✅ | 0 – 100 | Battery state of charge (%) |
| `latitude` | number | ❌ | -90 to 90 | Optional GPS latitude coordinates |
| `longitude` | number | ❌ | -180 to 180 | Optional GPS longitude coordinates |

**Response `201 Created`**
```json
{
  "success": true,
  "message": "Reading saved successfully",
  "data": {
    "_id": "6665f1a2b3c4d5e6f7a8b9c0",
    "deviceId": "device_001",
    "tiltAngle": 45.2,
    "height": 12.5,
    "voltageStatus": true,
    "batterySOC": 78.0,
    "latitude": 28.6139,
    "longitude": 77.2090,
    "timestamp": "2026-06-10T16:00:00.000Z",
    "__v": 0
  }
}
```

**Postman Setup:**
1. Method: `POST`
2. URL: `http://localhost:5000/device`
3. Headers: `Content-Type: application/json`
4. Body → raw → JSON:
```json
{
  "deviceId": "device_001",
  "tiltAngle": 45.2,
  "height": 12.5,
  "voltageStatus": true,
  "batterySOC": 78.0,
  "latitude": 28.6139,
  "longitude": 77.2090
}
```

---

## GET /device

### `GET /device`

Returns only the latest reading object.

**Query Parameters**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `deviceId` | string | ❌ | -- | Filter by device ID (optional) |

**Request (All Devices)**
```http
GET http://localhost:5000/device
```

**Request (Specific Device)**
```http
GET http://localhost:5000/device?deviceId=device_001
```

**Response `200 OK`**
```json
{
  "latest": {
    "_id": "6665f1a2b3c4d5e6f7a8b9c0",
    "deviceId": "device_001",
    "tiltAngle": 45.2,
    "height": 12.5,
    "voltageStatus": true,
    "batterySOC": 78.0,
    "timestamp": "2026-06-10T16:00:00.000Z"
  }
}
```
```

---

## PUT /device

### `PUT /device`

Updates an existing device reading in MongoDB Atlas. 

To identify the record, you must provide either:
- The MongoDB document ID (`id` or `_id`) in the request body/query (preferred).
- The `deviceId` in the request body/query, which updates the *latest* reading for that device.

**Request**
```http
PUT http://localhost:5000/device
Content-Type: application/json
```

**Body (example using document ID)**
```json
{
  "id": "6665f1a2b3c4d5e6f7a8b9c0",
  "tiltAngle": 48.5,
  "batterySOC": 75.0
}
```

**Body (example using device ID - updates latest reading)**
```json
{
  "deviceId": "device_001",
  "tiltAngle": 48.5,
  "batterySOC": 75.0
}
```

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `id` / `_id` | string | ❌ | Valid ObjectId | Document ID of the reading to update |
| `deviceId` | string | ❌ | non-empty | Updates the latest reading for this device |
| `tiltAngle` | number | ❌ | 0 – 90 | New tilt angle value |
| `height` | number | ❌ | ≥ 0 | New height value |
| `voltageStatus` | boolean | ❌ | true / false | New voltage status value |
| `batterySOC` | number | ❌ | 0 – 100 | New battery SOC value |
| `latitude` | number | ❌ | -90 to 90 | New latitude value |
| `longitude` | number | ❌ | -180 to 180 | New longitude value |

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Reading updated successfully",
  "data": {
    "_id": "6665f1a2b3c4d5e6f7a8b9c0",
    "deviceId": "device_001",
    "tiltAngle": 48.5,
    "height": 12.5,
    "voltageStatus": true,
    "batterySOC": 75.0,
    "latitude": 28.6139,
    "longitude": 77.2090,
    "timestamp": "2026-06-10T16:00:00.000Z"
  }
}
```

---

## DELETE /device

### `DELETE /device?deviceId=device_001` or `DELETE /device?id=6665f1a2b3c4d5e6f7a8b9c0`

Deletes device readings. Supports:
- Deleting all readings for a given `deviceId`.
- Deleting a single reading by its document `id` (or `_id`).

**Request (Delete by device ID)**
```http
DELETE http://localhost:5000/device?deviceId=device_001
```

**Request (Delete specific record by ID)**
```http
DELETE http://localhost:5000/device?id=6665f1a2b3c4d5e6f7a8b9c0
```

**Response `200 OK`**
```json
{
  "success": true,
  "deleted": 42,
  "message": "All readings for device deleted successfully"
}
```

---

## GET /device/status

### `GET /device/status`

Returns the current Bluetooth connection state and most recent reading.

**Request**
```http
GET http://localhost:5000/device/status
```

**Response `200 OK`**
```json
{
  "success": true,
  "status": {
    "connected": true,
    "deviceName": "MyBTDevice",
    "deviceId": "device_001",
    "connectedAt": "2026-06-10T15:00:00.000Z",
    "lastSeen": "2026-06-10T16:00:00.000Z"
  },
  "latestReading": { ... },
  "initialCommand": "F"
}
```

---

## POST /device/connect

### `POST /device/connect`

Records a connection or disconnection event.

**Connect**
```http
POST http://localhost:5000/device/connect
Content-Type: application/json

{
  "deviceName": "MyBTDevice",
  "deviceId": "device_001"
}
```

**Disconnect**
```json
{
  "action": "disconnect",
  "deviceName": "MyBTDevice"
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "status": { ... },
  "initialCommand": "F"
}
```

---

## Socket.IO Events

> **Socket URL:** `ws://localhost:5000`

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `deviceData` | `DeviceReading` | Live sensor data (every 1s in demo mode, or real BLE data) |
| `connectionStatus` | `ConnectionState` | Device connection state update |
| `connectionLog` | `LogEntry[]` | Recent connection/disconnect events |

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `bluetoothData` | `DeviceReading` | Real BLE data from browser (saved to MongoDB) |
| `deviceConnected` | `{ deviceName, deviceId }` | Notify backend of BLE connection |
| `deviceDisconnected` | `{ deviceName }` | Notify backend of BLE disconnection |

**`deviceData` payload example:**
```json
{
  "_id": "6665f1a2b3c4d5e6f7a8b9c0",
  "deviceId": "device_001",
  "tiltAngle": 45.2,
  "height": 12.5,
  "voltageStatus": true,
  "batterySOC": 78.0,
  "timestamp": "2026-06-10T16:00:00.000Z",
  "source": "bluetooth"
}
```

> ⚠️ **Simulated data** (when no real device is connected) is **broadcast only** — it is **NOT saved to MongoDB**. Only data via `POST /device` or `bluetoothData` socket events is persisted.

---

## Data Models

### DeviceReading (MongoDB Document)

```js
{
  _id:           ObjectId,   // Auto-generated
  deviceId:      String,     // Required — e.g. "device_001"
  tiltAngle:     Number,     // 0–90 degrees
  height:        Number,     // metres (≥ 0)
  voltageStatus: Boolean,    // true = Active, false = Inactive
  batterySOC:    Number,     // 0–100 %
  latitude:      Number,     // Optional latitude coordinates
  longitude:     Number,     // Optional longitude coordinates
  timestamp:     Date        // Auto-set to Date.now
}
```

### ConnectionState

```js
{
  connected:   Boolean,
  deviceName:  String | null,
  deviceId:    String | null,
  connectedAt: Date | null,
  lastSeen:    Date | null
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

| HTTP Code | Meaning |
|---|---|
| `400` | Bad Request — missing / invalid fields |
| `404` | Not Found |
| `500` | Internal Server Error |

**Example — missing fields `400`:**
```json
{
  "success": false,
  "error": "Missing required fields: deviceId, tiltAngle",
  "example": {
    "deviceId": "device_001",
    "tiltAngle": 45.2,
    "height": 12.5,
    "voltageStatus": true,
    "batterySOC": 78
  }
}
```

---

## Postman Quick Reference

Import these as a Postman Collection:

| # | Method | URL | Purpose |
|---|---|---|---|
| 1 | `GET` | `/health` | Check server + DB status |
| 2 | `POST` | `/device` | **Save a device reading** |
| 3 | `GET` | `/device` | **Get reading history (all devices)** |
| 4 | `PUT` | `/device` | **Update a device reading** |
| 5 | `DELETE` | `/device?deviceId=device_001` | Clear test data / specific reading |
| 6 | `GET` | `/device/status` | Get connection state |
| 7 | `POST` | `/device/connect` | Record connect event |

### Sample POST body to copy-paste in Postman:
```json
{
  "deviceId": "device_001",
  "tiltAngle": 45.2,
  "height": 12.5,
  "voltageStatus": true,
  "batterySOC": 78.0
}
```
