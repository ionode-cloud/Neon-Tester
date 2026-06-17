import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';

// ─── Platform detection ───────────────────────────────────────────────────────
const isNativePlatform = Capacitor.isNativePlatform();

// ─── Service / Characteristic UUIDs ───────────────────────────────────────────
// Capacitor BLE requires full 128-bit UUIDs for 16-bit services
const HM10_SERVICE_UUID      = numberToUUID(0xffe0);           // "0000ffe0-0000-1000-8000-00805f9b34fb"
const HM10_CHAR_UUID         = numberToUUID(0xffe1);           // "0000ffe1-0000-1000-8000-00805f9b34fb"
const NORDIC_NUS_SERVICE     = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_NUS_TX_CHAR     = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_NUS_RX_CHAR     = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

// For Web Bluetooth fallback (uses short 16-bit notation)
const HM10_SERVICE_SHORT     = 0xffe0;
const OPTIONAL_SERVICES      = [HM10_SERVICE_SHORT, NORDIC_NUS_SERVICE];

const UART_PROFILES = [
  { service: HM10_SERVICE_UUID,  rxChar: HM10_CHAR_UUID,    txChar: HM10_CHAR_UUID },
  { service: NORDIC_NUS_SERVICE, rxChar: NORDIC_NUS_RX_CHAR, txChar: NORDIC_NUS_TX_CHAR },
];

// Web Bluetooth profiles (short UUIDs)
const WEB_UART_PROFILES = [
  { service: HM10_SERVICE_SHORT, characteristic: 0xffe1 },
  { service: NORDIC_NUS_SERVICE, characteristic: NORDIC_NUS_TX_CHAR },
];


// ─── HC-05 Data Parser ────────────────────────────────────────────────────────
/**
 * Parses HC-05 raw string into a structured data object.
 * Supports two formats:
 *   JSON:      {"tiltAngle":15,"height":120,"voltageStatus":48.5,"batterySOC":82}
 *   Key=Value: TiltAngle:15,Height:120,VoltageStatus:48.5,BatterySOC:82
 *
 * Returns { tiltAngle, height, voltageStatus, batterySOC, timestamp } or null on failure.
 */
function parseHC05Data(raw) {
  console.log('[HC-05] Raw data received:', raw);

  if (!raw || typeof raw !== 'string') {
    console.error('[HC-05] Invalid raw data — not a string:', raw);
    return null;
  }

  const trimmed = raw.trim();

  // ── Attempt 1: JSON parse ─────────────────────────────────────────────────
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const result = {
        tiltAngle:     parseFloat(parsed.tiltAngle     ?? parsed.TiltAngle     ?? 0),
        height:        parseFloat(parsed.height        ?? parsed.Height        ?? 0),
        voltageStatus: !!(parsed.voltageStatus ?? parsed.VoltageStatus ?? false),
        batterySOC:    parseFloat(parsed.batterySOC    ?? parsed.BatterySOC    ?? 0),
        timestamp:     new Date(),
      };
      console.log('[HC-05] JSON format parsed successfully:');
      console.log('  → Tilt Angle   :', result.tiltAngle, '°');
      console.log('  → Height       :', result.height, 'm');
      console.log('  → Voltage Status:', result.voltageStatus ? 'Active' : 'Inactive');
      console.log('  → Battery SOC  :', result.batterySOC, '%');
      return result;
    } catch (jsonErr) {
      console.warn('[HC-05] JSON parse failed, trying key=value format:', jsonErr.message);
    }
  }

  // ── Attempt 2: Key=Value parse (e.g. TiltAngle:15,Height:120,...) ──────────
  try {
    const pairs = {};
    // Split by comma, then split each pair by first colon
    trimmed.split(',').forEach(segment => {
      const colonIdx = segment.indexOf(':');
      if (colonIdx === -1) return;
      const key = segment.slice(0, colonIdx).trim().toLowerCase().replace(/[_\s-]/g, '');
      const val = segment.slice(colonIdx + 1).trim();
      pairs[key] = val;
    });

    // Flexible key matching (case-insensitive, ignores separators)
    const get = (...keys) => {
      for (const k of keys) {
        const normalized = k.toLowerCase().replace(/[_\s-]/g, '');
        if (pairs[normalized] !== undefined) return pairs[normalized];
      }
      return undefined;
    };

    const tiltRaw     = get('tiltangle', 'tilt', 'angle');
    const heightRaw   = get('height', 'ht');
    const voltageRaw  = get('voltagestatus', 'voltage', 'volt', 'vs');
    const batteryRaw  = get('batterysoc', 'battery', 'batt', 'soc');

    if (tiltRaw === undefined && heightRaw === undefined && voltageRaw === undefined && batteryRaw === undefined) {
      console.error('[HC-05] Key=Value parse failed — no recognizable fields found. Keys found:', Object.keys(pairs));
      return null;
    }

    const result = {
      tiltAngle:     tiltRaw    !== undefined ? parseFloat(tiltRaw)    : 0,
      height:        heightRaw  !== undefined ? parseFloat(heightRaw)  : 0,
      voltageStatus: voltageRaw !== undefined
        ? (voltageRaw === 'true' || voltageRaw === '1' || voltageRaw === true)
        : false,
      batterySOC:    batteryRaw !== undefined ? parseFloat(batteryRaw) : 0,
      timestamp:     new Date(),
    };

    // Validate parsed numbers
    if (isNaN(result.tiltAngle) || isNaN(result.height) || isNaN(result.batterySOC)) {
      console.error('[HC-05] Key=Value parse produced NaN values:', result);
      return null;
    }

    console.log('[HC-05] Key=Value format parsed successfully:');
    console.log('  → Tilt Angle    :', result.tiltAngle, '°');
    console.log('  → Height        :', result.height, 'm');
    console.log('  → Voltage Status:', result.voltageStatus ? 'Active' : 'Inactive');
    console.log('  → Battery SOC   :', result.batterySOC, '%');
    return result;
  } catch (kvErr) {
    console.error('[HC-05] Key=Value parse failed with error:', kvErr.message);
    return null;
  }
}


// ─── Helper: encode string → DataView (for Capacitor BLE writes) ──────────────
function textToDataView(str) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return new DataView(bytes.buffer);
}

// ─── Helper: DataView → string ────────────────────────────────────────────────
function dataViewToString(dataView) {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength)).trim();
}


// ═══════════════════════════════════════════════════════════════════════════════
// NATIVE CAPACITOR BLE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

function useCapacitorBluetooth({
  onData,
  onBluetoothPowerOffWhileConnected,
  onReconnectSuccess,
  onDeviceFound,
  onBluetoothEnabled,
  onBluetoothDisabled,
} = {}) {
  const [isConnected, setIsConnected]         = useState(false);
  const [isScanning, setIsScanning]           = useState(false);
  const [isConnecting, setIsConnecting]       = useState(false);
  const [isReconnecting, setIsReconnecting]   = useState(false);
  const [isFetchingData, setIsFetchingData]   = useState(false);
  const [deviceInfo, setDeviceInfo]           = useState({ name: null, id: null });
  const [error, setError]                     = useState(null);
  const [deviceStatus, setDeviceStatus]       = useState(null);
  const [isBluetoothPoweredOn, setIsBluetoothPoweredOn] = useState(true);
  const [discoveredDevices, setDiscoveredDevices]       = useState([]);

  const connectedDeviceIdRef = useRef(null);
  const activeProfileRef     = useRef(null); // { service, rxChar, txChar }
  const bleInitializedRef    = useRef(false);
  const fetchResolveRef      = useRef(null);
  const fetchRejectRef       = useRef(null);

  // Always supported on native
  const isBluetoothSupported = true;

  // ── Initialize BleClient once ──────────────────────────────────────────────
  useEffect(() => {
    const initBle = async () => {
      try {
        await BleClient.initialize({ androidNeverForLocation: true });
        bleInitializedRef.current = true;
        console.log('[CAP-BLE] BleClient initialized');

        const enabled = await BleClient.isEnabled();
        setIsBluetoothPoweredOn(enabled);
        if (!enabled && onBluetoothDisabled) onBluetoothDisabled();
      } catch (err) {
        console.error('[CAP-BLE] Failed to initialize BleClient:', err);
        setIsBluetoothPoweredOn(false);
      }
    };
    initBle();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll Bluetooth enabled status (Capacitor doesn't have a listener) ─────
  useEffect(() => {
    if (!bleInitializedRef.current) return;

    const checkEnabled = async () => {
      try {
        const enabled = await BleClient.isEnabled();
        setIsBluetoothPoweredOn(prev => {
          if (prev && !enabled) {
            if (onBluetoothDisabled) onBluetoothDisabled();
            // If connected when BT turns off
            if (connectedDeviceIdRef.current && onBluetoothPowerOffWhileConnected) {
              onBluetoothPowerOffWhileConnected();
            }
          } else if (!prev && enabled) {
            if (onBluetoothEnabled) onBluetoothEnabled();
          }
          return enabled;
        });
      } catch { /* ignore */ }
    };

    const interval = setInterval(checkEnabled, 3000);
    return () => clearInterval(interval);
  }, [onBluetoothDisabled, onBluetoothEnabled, onBluetoothPowerOffWhileConnected]);


  // ── Notification handler ──────────────────────────────────────────────────
  const handleNotification = useCallback((dataView) => {
    try {
      const raw = dataViewToString(dataView);
      console.log('[HC-05] Notification received — decoded string:', raw);

      // Device status flags
      if (raw === 'F' || raw === 'OK' || raw === 'READY') {
        console.log('[HC-05] Device status flag received:', raw);
        setDeviceStatus(raw);
        return;
      }

      // Pending fetchData promise
      if (fetchResolveRef.current) {
        console.log('[HC-05] Resolving pending fetchData promise with raw data');
        const resolve = fetchResolveRef.current;
        fetchResolveRef.current = null;
        fetchRejectRef.current  = null;
        resolve(raw);
        return;
      }

      // Live streaming data
      const parsed = parseHC05Data(raw);
      if (parsed && onData && typeof onData === 'function') {
        console.log('[HC-05] Streaming data — calling onData callback');
        onData(parsed);
      } else if (!parsed) {
        console.warn('[HC-05] Could not parse streaming notification — data ignored');
      }
    } catch (err) {
      console.error('[HC-05] handleNotification error:', err.message);
    }
  }, [onData]);


  // ── Setup notifications on a connected device ─────────────────────────────
  const setupCharacteristics = useCallback(async (deviceId) => {
    let success = false;
    let lastError = null;

    for (const profile of UART_PROFILES) {
      try {
        console.log(`[CAP-BLE] Trying UART service: ${profile.service}`);

        // Start notifications on the TX characteristic (device → phone)
        await BleClient.startNotifications(
          deviceId,
          profile.service,
          profile.txChar,
          (value) => handleNotification(value)
        );
        console.log(`[CAP-BLE] Subscribed to notifications on ${profile.txChar}`);

        activeProfileRef.current = profile;

        // Send initial STATUS command
        try {
          await BleClient.write(deviceId, profile.service, profile.rxChar, textToDataView('STATUS'));
          console.log('[HC-05] Sent initial STATUS command to device');
        } catch (err) {
          console.warn('[HC-05] Send STATUS command failed (non-fatal):', err.message);
        }

        console.log(`[CAP-BLE] Successfully connected to UART profile on service: ${profile.service}`);
        success = true;
        break;
      } catch (err) {
        lastError = err;
        console.info(`[CAP-BLE] Profile ${profile.service} not active:`, err.message);
      }
    }

    if (!success) {
      console.warn('[CAP-BLE] UART characteristics subscription failed.', lastError?.message);
    }
  }, [handleNotification]);


  // ── Disconnect handler ────────────────────────────────────────────────────
  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setDeviceStatus(null);
    setDeviceInfo({ name: null, id: null });
    activeProfileRef.current = null;
    connectedDeviceIdRef.current = null;

    if (fetchRejectRef.current) {
      fetchRejectRef.current(new Error('Device disconnected during fetch'));
      fetchResolveRef.current = null;
      fetchRejectRef.current  = null;
    }
  }, []);


  // ── Add discovered device ────────────────────────────────────────────────
  const addDiscoveredDevice = useCallback((device, rssi = -70) => {
    const id   = device.deviceId;
    const name = device.localName || device.name || `BLE Device (${id.slice(0, 8)})`;

    const entry = {
      id,
      name,
      rssi,
      lastSeen: Date.now(),
      deviceObj: device,
    };

    setDiscoveredDevices(prev => {
      const index = prev.findIndex(d => d.id === id);
      if (index > -1) {
        const next = [...prev];
        next[index] = entry;
        return next;
      }
      if (onDeviceFound) onDeviceFound(name);
      return [...prev, entry];
    });
  }, [onDeviceFound]);


  // ── Scan ──────────────────────────────────────────────────────────────────
  const startScanning = useCallback(async () => {
    if (!bleInitializedRef.current) return;

    setError(null);
    setIsScanning(true);

    try {
      // Request permissions if needed (Android 12+)
      await BleClient.requestLEScan(
        {
          // Scan for devices advertising our known services
          // Using empty services array = scan all devices
          services: [],
          allowDuplicates: false,
        },
        (result) => {
          if (result.device) {
            const rssi = result.rssi !== undefined ? result.rssi : -75;
            addDiscoveredDevice(result.device, rssi);
          }
        }
      );

      // Auto-stop after 15 seconds
      setTimeout(async () => {
        try {
          await BleClient.stopLEScan();
        } catch { /* ignore */ }
        setIsScanning(false);
      }, 15000);
    } catch (err) {
      console.error('[CAP-BLE] Scan failed:', err.message);
      setError(err.message);
      setIsScanning(false);
    }
  }, [addDiscoveredDevice]);


  const stopScanning = useCallback(async () => {
    try {
      await BleClient.stopLEScan();
    } catch { /* ignore */ }
    setIsScanning(false);
  }, []);


  const clearDiscoveredDevices = useCallback(() => {
    setDiscoveredDevices([]);
  }, []);


  // Stop scanning when BT turns off
  useEffect(() => {
    if (!isBluetoothPoweredOn) {
      stopScanning();
      clearDiscoveredDevices();
    }
  }, [isBluetoothPoweredOn, stopScanning, clearDiscoveredDevices]);


  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    const deviceId = connectedDeviceIdRef.current;
    if (deviceId) {
      try {
        // Stop notifications first
        if (activeProfileRef.current) {
          try {
            await BleClient.stopNotifications(deviceId, activeProfileRef.current.service, activeProfileRef.current.txChar);
          } catch { /* ignore */ }
        }
        await BleClient.disconnect(deviceId);
      } catch (err) {
        console.warn('[CAP-BLE] Disconnect error:', err.message);
      }
    }
    handleDisconnect();
  }, [handleDisconnect]);


  // Disconnect when BT powers off while connected
  useEffect(() => {
    if (!isBluetoothPoweredOn && isConnected) {
      disconnect();
      setError('Bluetooth has been turned OFF');
      if (onBluetoothPowerOffWhileConnected) {
        onBluetoothPowerOffWhileConnected();
      }
    }
  }, [isBluetoothPoweredOn, isConnected, disconnect, onBluetoothPowerOffWhileConnected]);


  // ── Connect to a discovered device ────────────────────────────────────────
  const connectDevice = useCallback(async (scannedDevice) => {
    if (!bleInitializedRef.current || !isBluetoothPoweredOn) return null;
    setIsConnecting(true);
    setError(null);

    const deviceId = scannedDevice.id;
    const name     = scannedDevice.name || 'Unknown Device';

    try {
      await BleClient.connect(deviceId, () => {
        console.log('[CAP-BLE] Device disconnected unexpectedly');
        handleDisconnect();
      });

      connectedDeviceIdRef.current = deviceId;
      await setupCharacteristics(deviceId);

      setIsConnected(true);
      setDeviceInfo({ name, id: deviceId });
      setIsConnecting(false);

      localStorage.setItem('lastConnectedDevice', JSON.stringify({ id: deviceId, name }));
      return { name, id: deviceId };
    } catch (err) {
      setIsConnecting(false);
      console.error('[CAP-BLE] Connect failed:', err.message);
      setError(err.message);
      return null;
    }
  }, [isBluetoothPoweredOn, handleDisconnect, setupCharacteristics]);


  // ── Connect (scan + pick first / use requestDevice) ───────────────────────
  const connect = useCallback(async () => {
    if (!bleInitializedRef.current) return null;
    setIsConnecting(true);
    setError(null);

    try {
      // Use requestDevice which shows native picker on Android/iOS
      const device = await BleClient.requestDevice({
        services: [],
        optionalServices: [HM10_SERVICE_UUID, NORDIC_NUS_SERVICE],
      });

      const name = device.localName || device.name || 'Unknown Device';
      const deviceId = device.deviceId;

      // Add to discovered list
      addDiscoveredDevice(device, -65);

      await BleClient.connect(deviceId, () => {
        console.log('[CAP-BLE] Device disconnected unexpectedly');
        handleDisconnect();
      });

      connectedDeviceIdRef.current = deviceId;
      await setupCharacteristics(deviceId);

      setIsConnected(true);
      setDeviceInfo({ name, id: deviceId });
      setIsConnecting(false);

      localStorage.setItem('lastConnectedDevice', JSON.stringify({ id: deviceId, name }));
      return { name, id: deviceId };
    } catch (err) {
      setIsConnecting(false);
      if (err.message?.includes('cancelled') || err.message?.includes('canceled')) {
        console.info('[CAP-BLE] User cancelled device picker');
      } else {
        console.error('[CAP-BLE] Connect failed:', err.message);
        setError(err.message);
      }
      return null;
    }
  }, [addDiscoveredDevice, handleDisconnect, setupCharacteristics]);


  // ── Reconnect ─────────────────────────────────────────────────────────────
  const reconnect = useCallback(async () => {
    if (!bleInitializedRef.current || !isBluetoothPoweredOn) return null;
    setIsReconnecting(true);
    setError(null);

    const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
    if (!lastDeviceStr) {
      setError('No previously paired device found. Please scan to pair again.');
      setIsReconnecting(false);
      return null;
    }

    const lastDevice = JSON.parse(lastDeviceStr);

    try {
      await BleClient.connect(lastDevice.id, () => {
        console.log('[CAP-BLE] Device disconnected during reconnect');
        handleDisconnect();
      });

      connectedDeviceIdRef.current = lastDevice.id;
      await setupCharacteristics(lastDevice.id);

      const name = lastDevice.name || 'Unknown Device';
      setIsConnected(true);
      setDeviceInfo({ name, id: lastDevice.id });
      setIsReconnecting(false);

      if (onReconnectSuccess) onReconnectSuccess(name);
      return { name, id: lastDevice.id };
    } catch (err) {
      console.warn('[CAP-BLE] Reconnect failed:', err.message);
      setError('Could not reconnect. The device may be out of range.');
      setIsReconnecting(false);
      return null;
    }
  }, [isBluetoothPoweredOn, handleDisconnect, setupCharacteristics, onReconnectSuccess]);


  // ── Auto-reconnect on startup ─────────────────────────────────────────────
  useEffect(() => {
    if (isBluetoothPoweredOn && bleInitializedRef.current) {
      const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
      if (lastDeviceStr) {
        const lastDevice = JSON.parse(lastDeviceStr);
        (async () => {
          try {
            setIsReconnecting(true);
            await BleClient.connect(lastDevice.id, () => handleDisconnect());
            connectedDeviceIdRef.current = lastDevice.id;
            await setupCharacteristics(lastDevice.id);

            setIsConnected(true);
            setDeviceInfo({ name: lastDevice.name, id: lastDevice.id });
            if (onReconnectSuccess) onReconnectSuccess(lastDevice.name);
          } catch (err) {
            console.warn('[CAP-BLE] Auto-reconnect failed:', err.message);
          } finally {
            setIsReconnecting(false);
          }
        })();
      }
    }
  }, [isBluetoothPoweredOn]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Fetch Data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const deviceId = connectedDeviceIdRef.current;
    const profile  = activeProfileRef.current;

    if (!deviceId || !profile) {
      console.error('[HC-05] fetchData called but no device is connected');
      throw new Error('No device connected');
    }

    console.log('[HC-05] Fetch Data initiated — sending GET_DATA command');
    setIsFetchingData(true);

    return new Promise((resolve, reject) => {
      fetchResolveRef.current = resolve;
      fetchRejectRef.current  = reject;

      const sendCommand = async () => {
        try {
          await BleClient.write(deviceId, profile.service, profile.rxChar, textToDataView('GET_DATA'));
          console.log('[HC-05] ✓ GET_DATA command sent — waiting for response…');
        } catch (primaryErr) {
          console.warn('[HC-05] GET_DATA failed, retrying with FETCH:', primaryErr.message);
          try {
            await BleClient.write(deviceId, profile.service, profile.rxChar, textToDataView('FETCH'));
            console.log('[HC-05] ✓ FETCH command sent (fallback) — waiting for response…');
          } catch (fallbackErr) {
            console.warn('[HC-05] Both commands failed:', fallbackErr.message);
          }
        }
      };
      sendCommand();

      const TIMEOUT_MS = 5000;
      const timer = setTimeout(() => {
        if (fetchResolveRef.current) {
          fetchResolveRef.current = null;
          fetchRejectRef.current  = null;
          console.error(`[HC-05] ✗ No response within ${TIMEOUT_MS / 1000}s — timeout`);
          reject(new Error(`No data received from HC-05 within ${TIMEOUT_MS / 1000} seconds`));
        }
      }, TIMEOUT_MS);

      const origResolve = resolve;
      fetchResolveRef.current = (val) => {
        clearTimeout(timer);
        console.log('[HC-05] ✓ Response received from HC-05');
        origResolve(val);
      };
    }).finally(() => {
      setIsFetchingData(false);
    });
  }, []);


  const parseFetchedData = useCallback((raw) => {
    return parseHC05Data(raw);
  }, []);


  // ── Send Command ──────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (command) => {
    const deviceId = connectedDeviceIdRef.current;
    const profile  = activeProfileRef.current;
    if (!deviceId || !profile) return;

    try {
      await BleClient.write(deviceId, profile.service, profile.rxChar, textToDataView(command));
    } catch (err) {
      console.warn('[CAP-BLE] Send command failed:', err.message);
    }
  }, []);


  const connectionStatus = useMemo(() => {
    if (!isBluetoothPoweredOn) return 'off';
    if (isConnecting)          return 'connecting';
    if (isReconnecting)        return 'reconnecting';
    if (isFetchingData)        return 'fetching';
    if (isConnected)           return 'connected';
    if (isScanning)            return 'scanning';
    return 'disconnected';
  }, [isBluetoothPoweredOn, isConnecting, isReconnecting, isFetchingData, isConnected, isScanning]);


  return {
    connect,
    connectDevice,
    disconnect,
    reconnect,
    sendCommand,
    fetchData,
    parseFetchedData,
    startScanning,
    stopScanning,
    clearDiscoveredDevices,
    isConnected,
    isScanning,
    isConnecting,
    isReconnecting,
    isFetchingData,
    deviceInfo,
    error,
    deviceStatus,
    discoveredDevices,
    isBluetoothPoweredOn,
    connectionStatus,
    isBluetoothSupported,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// WEB BLUETOOTH FALLBACK (for desktop browser development)
// ═══════════════════════════════════════════════════════════════════════════════

function useWebBluetooth({
  onData,
  onBluetoothPowerOffWhileConnected,
  onReconnectSuccess,
  onDeviceFound,
  onBluetoothEnabled,
  onBluetoothDisabled,
} = {}) {
  const [isConnected, setIsConnected]         = useState(false);
  const [isScanning, setIsScanning]           = useState(false);
  const [isConnecting, setIsConnecting]       = useState(false);
  const [isReconnecting, setIsReconnecting]   = useState(false);
  const [isFetchingData, setIsFetchingData]   = useState(false);
  const [deviceInfo, setDeviceInfo]           = useState({ name: null, id: null });
  const [error, setError]                     = useState(null);
  const [deviceStatus, setDeviceStatus]       = useState(null);
  const [isBluetoothPoweredOn, setIsBluetoothPoweredOn] = useState(true);
  const [discoveredDevices, setDiscoveredDevices]       = useState([]);

  const deviceRef         = useRef(null);
  const serverRef         = useRef(null);
  const characteristicRef = useRef(null);
  const isPoweredOnRef    = useRef(true);
  const knownDevicesRef   = useRef(new Map());
  const fetchResolveRef   = useRef(null);
  const fetchRejectRef    = useRef(null);

  const isBluetoothSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;


  const handleNotification = useCallback(
    (event) => {
      try {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        const raw = decoder.decode(value).trim();

        console.log('[HC-05] Notification received — raw bytes:', value.byteLength, 'bytes');
        console.log('[HC-05] Decoded string:', raw);

        // ── Device status flag (sent by HC-05 to signal ready state) ──────────
        if (raw === 'F' || raw === 'OK' || raw === 'READY') {
          console.log('[HC-05] Device status flag received:', raw);
          setDeviceStatus(raw);
          return;
        }

        // ── If there is a pending fetchData promise, resolve it first ──────────
        if (fetchResolveRef.current) {
          console.log('[HC-05] Resolving pending fetchData promise with raw data');
          const resolve = fetchResolveRef.current;
          fetchResolveRef.current = null;
          fetchRejectRef.current  = null;
          resolve(raw);
          return;
        }

        // ── Live streaming data (continuous notifications) ─────────────────────
        const parsed = parseHC05Data(raw);
        if (parsed && onData && typeof onData === 'function') {
          console.log('[HC-05] Streaming data — calling onData callback');
          onData(parsed);
        } else if (!parsed) {
          console.warn('[HC-05] Could not parse streaming notification — data ignored');
        }
      } catch (err) {
        console.error('[HC-05] handleNotification error:', err.message);
      }
    },
    [onData]
  );

  const setupCharacteristics = useCallback(async (server) => {
    let success = false;
    let lastError = null;

    for (const profile of WEB_UART_PROFILES) {
      try {
        console.log(`[BT] Attempting connection to UART service: ${profile.service}`);
        const service = await server.getPrimaryService(profile.service);
        const characteristic = await service.getCharacteristic(profile.characteristic);

        if (characteristic.properties.notify) {
          await characteristic.startNotifications();
          characteristic.addEventListener('characteristicvaluechanged', handleNotification);
          console.log(`[BT] Subscribed to notifications on characteristic: ${profile.characteristic}`);
        } else {
          console.warn('[BT] Characteristic does not support notify — no live streaming available');
        }
        characteristicRef.current = characteristic;

        // Send initial STATUS command so HC-05 knows we are ready
        try {
          const encoder = new TextEncoder();
          await characteristic.writeValue(encoder.encode('STATUS'));
          console.log('[HC-05] Sent initial STATUS command to device');
        } catch (err) {
          console.warn('[HC-05] Send STATUS command failed (non-fatal):', err.message);
        }

        console.log(`[BT] Successfully connected to UART profile on service: ${profile.service}`);
        success = true;
        break;
      } catch (err) {
        lastError = err;
        console.info(`[BT] Profile ${profile.service} not active:`, err.message);
      }
    }

    if (!success) {
      console.warn('[BT] UART characteristics subscription failed. Operating without notifications.', lastError?.message);
    }
  }, [handleNotification]);

  const handleGattDisconnected = useCallback(() => {
    setIsConnected(false);
    setDeviceStatus(null);
    setDeviceInfo({ name: null, id: null });
    characteristicRef.current = null;
    serverRef.current = null;
    // Reject any pending fetchData on unexpected disconnect
    if (fetchRejectRef.current) {
      fetchRejectRef.current(new Error('Device disconnected during fetch'));
      fetchResolveRef.current = null;
      fetchRejectRef.current  = null;
    }
  }, []);


  useEffect(() => {
    if (!isBluetoothSupported) {
      setIsBluetoothPoweredOn(false);
      isPoweredOnRef.current = false;
      return;
    }

    if (navigator.bluetooth.getAvailability) {
      navigator.bluetooth.getAvailability().then((available) => {
        setIsBluetoothPoweredOn(available);
        isPoweredOnRef.current = available;
      }).catch(() => {});
    }

    const handleAvailabilityChanged = (event) => {
      const available = event.value;
      setIsBluetoothPoweredOn(available);

      if (available && !isPoweredOnRef.current) {
        if (onBluetoothEnabled) onBluetoothEnabled();
      } else if (!available && isPoweredOnRef.current) {
        if (onBluetoothDisabled) onBluetoothDisabled();
      }
      isPoweredOnRef.current = available;
    };

    navigator.bluetooth.addEventListener('availabilitychanged', handleAvailabilityChanged);
    return () => {
      navigator.bluetooth.removeEventListener('availabilitychanged', handleAvailabilityChanged);
    };
  }, [isBluetoothSupported, onBluetoothEnabled, onBluetoothDisabled]);


  const disconnect = useCallback(async () => {
    if (characteristicRef.current) {
      try {
        characteristicRef.current.removeEventListener(
          'characteristicvaluechanged',
          handleNotification
        );
        if (characteristicRef.current.properties?.notify) {
          await characteristicRef.current.stopNotifications();
        }
      } catch {  }
      characteristicRef.current = null;
    }

    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }

    handleGattDisconnected();
  }, [handleNotification, handleGattDisconnected]);


  useEffect(() => {
    if (!isBluetoothPoweredOn && isConnected) {
      disconnect();
      setError('Bluetooth has been turned OFF');
      if (onBluetoothPowerOffWhileConnected) {
        onBluetoothPowerOffWhileConnected();
      }
    }
  }, [isBluetoothPoweredOn, isConnected, disconnect, onBluetoothPowerOffWhileConnected]);


  const addDiscoveredDevice = useCallback((device, rssi = -70) => {
    const id   = device.id;
    const name = device.name || `BLE Device (${id.slice(0, 8)})`;

    const entry = {
      id,
      name,
      rssi,
      lastSeen: Date.now(),
      deviceObj: device,
    };

    knownDevicesRef.current.set(id, entry);

    setDiscoveredDevices(prev => {
      const index = prev.findIndex(d => d.id === id);
      if (index > -1) {
        const next = [...prev];
        next[index] = entry;
        return next;
      }

      if (onDeviceFound) onDeviceFound(name);
      return [...prev, entry];
    });
  }, [onDeviceFound]);


  const startScanning = useCallback(async () => {
    if (!isBluetoothSupported) return;

    setError(null);
    setIsScanning(true);

    try {
      if (navigator.bluetooth.requestLEScan) {
        try {
          const scan = await navigator.bluetooth.requestLEScan({
            acceptAllAdvertisements: true,
            keepRepeatedDevices: false,
          });

          const onAdvert = (event) => {
            const dev  = event.device;
            const rssi = event.rssi !== undefined ? event.rssi : -75;
            addDiscoveredDevice(dev, rssi);
          };
          navigator.bluetooth.addEventListener('advertisementreceived', onAdvert);

          setTimeout(() => {
            try { scan.stop(); } catch {}
            navigator.bluetooth.removeEventListener('advertisementreceived', onAdvert);
            setIsScanning(false);
          }, 15000);

          return;
        } catch (leScanErr) {
          console.info('[BT] requestLEScan not available, falling back to requestDevice picker:', leScanErr.message);
        }
      }

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: OPTIONAL_SERVICES,
      });

      const simulatedRssi = -(Math.floor(Math.random() * 40) + 50);
      addDiscoveredDevice(device, simulatedRssi);

    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'AbortError') {
        console.info('[BT] User closed device picker without selecting a device.');
      } else {
        console.warn('[BT] Scan failed:', err.message);
        setError(err.message);
      }
    } finally {
      setIsScanning(false);
    }
  }, [isBluetoothSupported, isBluetoothPoweredOn, addDiscoveredDevice]);


  const stopScanning = useCallback(() => {
    setIsScanning(false);
  }, []);


  const clearDiscoveredDevices = useCallback(() => {
    knownDevicesRef.current.clear();
    setDiscoveredDevices([]);
  }, []);


  useEffect(() => {
    if (!isBluetoothPoweredOn) {
      stopScanning();
      clearDiscoveredDevices();
    }
  }, [isBluetoothPoweredOn, stopScanning, clearDiscoveredDevices]);


  const attemptAutoReconnect = useCallback(async () => {
    if (!isBluetoothSupported || !isBluetoothPoweredOn || !navigator.bluetooth.getDevices) return;
    const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
    if (!lastDeviceStr) return;
    const lastDevice = JSON.parse(lastDeviceStr);

    try {
      setIsReconnecting(true);
      setError(null);
      const devices = await navigator.bluetooth.getDevices();
      const match = devices.find(d => d.id === lastDevice.id);

      if (match) {
        console.log('[BT] Found permitted device for auto-reconnection:', match.name);
        deviceRef.current = match;

        match.addEventListener('gattserverdisconnected', handleGattDisconnected);

        const server = await match.gatt.connect();
        serverRef.current = server;

        await setupCharacteristics(server);

        setIsConnected(true);
        setDeviceInfo({ name: match.name || 'Unknown Device', id: match.id });
        if (onReconnectSuccess) onReconnectSuccess(match.name || 'Unknown Device');
      }
    } catch (err) {
      console.warn('[BT] Auto-reconnect failed:', err.message);
    } finally {
      setIsReconnecting(false);
    }
  }, [isBluetoothSupported, isBluetoothPoweredOn, handleGattDisconnected, setupCharacteristics, onReconnectSuccess]);


  const reconnect = useCallback(async () => {
    if (!isBluetoothSupported || !isBluetoothPoweredOn) return null;
    setIsReconnecting(true);
    setError(null);

    try {
      if (deviceRef.current) {
        try {
          deviceRef.current.addEventListener('gattserverdisconnected', handleGattDisconnected);
          const server = await deviceRef.current.gatt.connect();
          serverRef.current = server;
          await setupCharacteristics(server);

          const name = deviceRef.current.name || 'Unknown Device';
          const id   = deviceRef.current.id;
          setIsConnected(true);
          setDeviceInfo({ name, id });
          localStorage.setItem('lastConnectedDevice', JSON.stringify({ id, name }));
          if (onReconnectSuccess) onReconnectSuccess(name);
          setIsReconnecting(false);
          return { name, id };
        } catch (err) {
          console.warn('[BT] Direct reconnect failed, trying permitted devices:', err.message);
        }
      }

      if (navigator.bluetooth.getDevices) {
        const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
        if (lastDeviceStr) {
          const lastDevice = JSON.parse(lastDeviceStr);
          const devices = await navigator.bluetooth.getDevices();
          const match = devices.find(d => d.id === lastDevice.id);

          if (match) {
            deviceRef.current = match;
            match.addEventListener('gattserverdisconnected', handleGattDisconnected);
            const server = await match.gatt.connect();
            serverRef.current = server;
            await setupCharacteristics(server);

            const name = match.name || lastDevice.name || 'Unknown Device';
            const id   = match.id;
            setIsConnected(true);
            setDeviceInfo({ name, id });
            localStorage.setItem('lastConnectedDevice', JSON.stringify({ id, name }));
            if (onReconnectSuccess) onReconnectSuccess(name);
            setIsReconnecting(false);
            return { name, id };
          }
        }
      }

      setError('No previously paired device found. Please scan to pair again.');
      setIsReconnecting(false);
      return null;
    } catch (err) {
      console.warn('[BT] Reconnect failed:', err.message);
      setError(err.message);
      setIsReconnecting(false);
      return null;
    }
  }, [isBluetoothSupported, isBluetoothPoweredOn, handleGattDisconnected, setupCharacteristics, onReconnectSuccess]);


  const connectDevice = useCallback(async (scannedDevice) => {
    if (!isBluetoothSupported || !isBluetoothPoweredOn) return null;
    setIsConnecting(true);
    setError(null);

    const name = scannedDevice.name || 'Unknown Device';
    const id   = scannedDevice.id;

    try {
      let device = scannedDevice.deviceObj;

      try {
        device.addEventListener('gattserverdisconnected', handleGattDisconnected);
        const server = await device.gatt.connect();
        serverRef.current = server;
        deviceRef.current = device;
        await setupCharacteristics(server);
      } catch (err) {
        console.log('[BT] Direct connect failed, prompting picker for permission fallback:', err.message);
        device = await navigator.bluetooth.requestDevice({
          filters: [{ name: scannedDevice.name }],
          optionalServices: OPTIONAL_SERVICES,
        });
        device.addEventListener('gattserverdisconnected', handleGattDisconnected);
        const server = await device.gatt.connect();
        serverRef.current = server;
        deviceRef.current = device;
        await setupCharacteristics(server);
      }

      setIsConnected(true);
      setDeviceInfo({ name, id });
      setIsConnecting(false);

      localStorage.setItem('lastConnectedDevice', JSON.stringify({ id, name }));

      return { name, id };
    } catch (err) {
      setIsConnecting(false);
      if (err.name !== 'NotFoundError') {
        setError(err.message);
      }
      return null;
    }
  }, [isBluetoothSupported, isBluetoothPoweredOn, handleGattDisconnected, setupCharacteristics]);


  const connect = useCallback(async () => {
    if (!isBluetoothSupported) return null;
    setIsConnecting(true);
    setError(null);

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: OPTIONAL_SERVICES,
      });

      const name = device.name || 'Unknown Device';
      const id   = device.id || 'N/A';

      addDiscoveredDevice(device, -65);

      device.addEventListener('gattserverdisconnected', handleGattDisconnected);
      const server = await device.gatt.connect();
      serverRef.current = server;
      deviceRef.current = device;

      await setupCharacteristics(server);

      setIsConnected(true);
      setDeviceInfo({ name, id });
      setIsConnecting(false);

      localStorage.setItem('lastConnectedDevice', JSON.stringify({ id, name }));
      return { name, id };
    } catch (err) {
      setIsConnecting(false);
      if (err.name !== 'NotFoundError') {
        setError(err.message);
      }
      return null;
    }
  }, [isBluetoothSupported, isBluetoothPoweredOn, handleGattDisconnected, setupCharacteristics, addDiscoveredDevice]);


  useEffect(() => {
    if (isBluetoothPoweredOn) {
      attemptAutoReconnect().catch(() => {});
    }
  }, [isBluetoothPoweredOn, attemptAutoReconnect]);


  const fetchData = useCallback(async () => {
    if (!characteristicRef.current) {
      console.error('[HC-05] fetchData called but no device is connected');
      throw new Error('No device connected');
    }

    console.log('[HC-05] Fetch Data initiated — sending GET_DATA command to HC-05');
    setIsFetchingData(true);

    return new Promise((resolve, reject) => {
      fetchResolveRef.current = resolve;
      fetchRejectRef.current  = reject;

      const sendCommand = async () => {
        const encoder = new TextEncoder();
        try {
          await characteristicRef.current.writeValue(encoder.encode('GET_DATA'));
          console.log('[HC-05] ✓ GET_DATA command sent to HC-05 — waiting for response…');
        } catch (primaryErr) {
          console.warn('[HC-05] GET_DATA failed, retrying with FETCH command:', primaryErr.message);
          try {
            await characteristicRef.current.writeValue(encoder.encode('FETCH'));
            console.log('[HC-05] ✓ FETCH command sent to HC-05 (fallback) — waiting for response…');
          } catch (fallbackErr) {
            console.warn('[HC-05] Both commands failed to send:', fallbackErr.message);
          }
        }
      };
      sendCommand();

      const TIMEOUT_MS = 5000;
      const timer = setTimeout(() => {
        if (fetchResolveRef.current) {
          fetchResolveRef.current = null;
          fetchRejectRef.current  = null;
          console.error(`[HC-05] ✗ No response from device within ${TIMEOUT_MS / 1000}s — timeout`);
          reject(new Error(`No data received from HC-05 within ${TIMEOUT_MS / 1000} seconds`));
        }
      }, TIMEOUT_MS);

      const origResolve = resolve;
      fetchResolveRef.current = (val) => {
        clearTimeout(timer);
        console.log('[HC-05] ✓ Response received from HC-05');
        origResolve(val);
      };
    }).finally(() => {
      setIsFetchingData(false);
    });
  }, []);


  const parseFetchedData = useCallback((raw) => {
    return parseHC05Data(raw);
  }, []);


  const connectionStatus = useMemo(() => {
    if (!isBluetoothSupported) return 'unsupported';
    if (!isBluetoothPoweredOn) return 'off';
    if (isConnecting)          return 'connecting';
    if (isReconnecting)        return 'reconnecting';
    if (isFetchingData)        return 'fetching';
    if (isConnected)           return 'connected';
    if (isScanning)            return 'scanning';
    return 'disconnected';
  }, [isBluetoothSupported, isBluetoothPoweredOn, isConnecting, isReconnecting, isFetchingData, isConnected, isScanning]);

  const sendCommand = useCallback(async (command) => {
    if (!characteristicRef.current) return;
    try {
      const encoder = new TextEncoder();
      await characteristicRef.current.writeValue(encoder.encode(command));
    } catch (err) {
      console.warn('[BT] Send command failed:', err.message);
    }
  }, []);

  return {
    connect,
    connectDevice,
    disconnect,
    reconnect,
    sendCommand,
    fetchData,
    parseFetchedData,
    startScanning,
    stopScanning,
    clearDiscoveredDevices,
    isConnected,
    isScanning,
    isConnecting,
    isReconnecting,
    isFetchingData,
    deviceInfo,
    error,
    deviceStatus,
    discoveredDevices,
    isBluetoothPoweredOn,
    connectionStatus,
    isBluetoothSupported,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — auto-selects native or web implementation
// ═══════════════════════════════════════════════════════════════════════════════

export default function useBluetooth(options = {}) {
  if (isNativePlatform) {
    return useCapacitorBluetooth(options);   // eslint-disable-line react-hooks/rules-of-hooks
  }
  return useWebBluetooth(options);          // eslint-disable-line react-hooks/rules-of-hooks
}
