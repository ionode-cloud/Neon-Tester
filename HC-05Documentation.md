# HC-05 Bluetooth Communication — Neon Tester

## Architecture

```
┌─────────────────────────┐         BLE GATT / UART         ┌──────────────────────┐
│   HC-05 / Robot Device  │ ─────── UART Notification ──▶  │  Browser (Web BT API) │
│  (sends JSON or KV str) │ ◀────── GET_DATA / STATUS ───── │  useBluetooth.js      │
└─────────────────────────┘                                  └──────────┬───────────┘
                                                                        │ onData() callback
                                                                        ▼
                                                             ┌──────────────────────┐
                                                             │     App.jsx          │
                                                             │  handleBluetoothData │
                                                             └──────────┬───────────┘
                                                                        │ Socket.IO emit
                                                                        ▼
                                                             ┌──────────────────────┐
                                                             │   Backend server.js   │
                                                             │  saves to MongoDB     │
                                                             │  broadcasts to all   │
                                                             └──────────────────────┘
```

---

## BLE Services (UART Profiles)

The app tries to connect to these two UART profiles **in order**. The first one that succeeds is used:

| Profile     | Service UUID                             | Characteristic UUID                        | Notes               |
|-------------|------------------------------------------|--------------------------------------------|---------------------|
| **HM-10**   | `0xFFE0` (65504)                         | `0xFFE1`                                   | Common HC-05 chips  |
| **Nordic NUS** | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` (RX notify) | Adafruit/nRF52 etc. |

> **Important:** Your HC-05 firmware must advertise one of these service UUIDs. If neither is found, the device connects but operates without live streaming notifications.

---

## Commands Sent to HC-05

| Command    | Timing            | Purpose                                      |
|------------|-------------------|----------------------------------------------|
| `STATUS`   | On connection     | Initial handshake — signals the app is ready |
| `GET_DATA` | On Fetch button   | Request a one-shot data reading              |
| `FETCH`    | Fallback command  | Used if `GET_DATA` fails (older firmware)    |

---

## Data Formats Supported

The app auto-detects and parses **both formats**:

### Format 1 — JSON (preferred)

```json
{
  "tiltAngle": 15,
  "height": 120,
  "voltageStatus": true,
  "batterySOC": 82
}
```

### Format 2 — Key=Value String (HC-05 text output)

```
TiltAngle:15,Height:120,VoltageStatus:1,BatterySOC:82

### Status Flags (single-character responses)

| Value    | Meaning                         |
|----------|---------------------------------|
| `F`      | Device is ready / idle          |
| `OK`     | Acknowledgment                  |
| `READY`  | Device initialized              |

---

## Data Fields

| Field           | Type    | Unit | Range        | Description                              |
|-----------------|---------|------|--------------|------------------------------------------|
| `tiltAngle`     | Number  | °    | 0 – 90       | Tilt angle of the robot structure        |
| `height`        | Number  | m    | ≥ 0          | Height of the mechanism                  |
| `voltageStatus` | Boolean | —    | true / false | `true` = Active, `false` = Inactive      |
| `batterySOC`    | Number  | %    | 0 – 100      | Battery State of Charge                  |

> **Note:** `voltageStatus` is a Boolean. Send `true` (or `1` in Key=Value format) when the voltage line is active, `false` (or `0`) when inactive. The dashboard displays **Active** (green) or **Inactive** (red).

### Example console output for a successful fetch:

```
[App]    handleFetchData triggered — requesting data from HC-05
[HC-05]  Fetch Data initiated — sending GET_DATA command to HC-05
[HC-05]  ✓ GET_DATA command sent to HC-05 — waiting for response…
[HC-05]  Notification received — raw bytes: 64 bytes
[HC-05]  Decoded string: TiltAngle:15,Height:120,VoltageStatus:1,BatterySOC:82
[HC-05]  Raw data received: TiltAngle:15,Height:120,VoltageStatus:1,BatterySOC:82
[HC-05]  Key=Value format parsed successfully:
           → Tilt Angle    : 15 °
           → Height        : 120 m
           → Voltage Status: Active
           → Battery SOC   : 82 %
[HC-05]  ✓ Response received from HC-05
[App]    Parsed HC-05 data — updating dashboard KPI cards: { tiltAngle: 15, height: 120, voltageStatus: true, batterySOC: 82 }
[WS]     bluetoothData received from client: { deviceId: 'ble_device', tiltAngle: 15, ... }
[WS]     bluetoothData saved to MongoDB — id: 6653f2a1...
```

## API Reference

### REST Endpoints (Backend)

| Method | Endpoint          | Description                         |
|--------|-------------------|-------------------------------------|
| GET    | `/device`         | Latest reading from MongoDB         |
| POST   | `/device`         | Save a reading manually (Postman)   |
| PUT    | `/device`         | Update a reading by ID              |
| DELETE | `/device`         | Delete a reading by ID / deviceId   |
| DELETE | `/device/all`     | Wipe all records                    |
| GET    | `/device/history` | Paginated reading history           |
| GET    | `/device/status`  | Connection state + latest reading   |
| POST   | `/device/connect` | Register connect/disconnect event   |
| GET    | `/health`         | Server + DB health check            |
