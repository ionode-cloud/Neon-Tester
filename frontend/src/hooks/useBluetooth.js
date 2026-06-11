import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

const HM10_SERVICE = 0xffe0;
const NORDIC_NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const OPTIONAL_SERVICES = [HM10_SERVICE, NORDIC_NUS_SERVICE];

const UART_PROFILES = [
  {
    service: HM10_SERVICE,
    characteristic: 0xffe1
  },
  {
    service: NORDIC_NUS_SERVICE,
    characteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
  }
];

/**
 * useBluetooth — Advanced custom hook for Web Bluetooth API integration.
 *
 * NOTE: The Web Bluetooth `requestLEScan` API is experimental and only works
 * in Chrome with `chrome://flags/#enable-experimental-web-platform-features`.
 * This hook uses `requestDevice` (the stable, universally-supported API) for
 * scanning and device discovery, which opens the browser's native BLE picker.
 */
export default function useBluetooth({
  onData,
  onBluetoothPowerOffWhileConnected,
  onReconnectSuccess,
  onDeviceFound,
  onBluetoothEnabled,
  onBluetoothDisabled,
} = {}) {
  const [isConnected, setIsConnected]     = useState(false);
  const [isScanning, setIsScanning]       = useState(false);
  const [isConnecting, setIsConnecting]   = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [deviceInfo, setDeviceInfo]       = useState({ name: null, id: null });
  const [error, setError]                 = useState(null);
  const [deviceStatus, setDeviceStatus]   = useState(null);
  const [isBluetoothPoweredOn, setIsBluetoothPoweredOn] = useState(true);
  const [discoveredDevices, setDiscoveredDevices]       = useState([]);

  const deviceRef         = useRef(null);
  const serverRef         = useRef(null);
  const characteristicRef = useRef(null);
  const isPoweredOnRef    = useRef(true);
  const knownDevicesRef   = useRef(new Map()); // id -> device entry

  const isBluetoothSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

  // ─── Setup characteristics subscription ────────────────────────────────────
  const setupCharacteristics = useCallback(async (server) => {
    let success = false;
    let lastError = null;

    for (const profile of UART_PROFILES) {
      try {
        console.log(`[BT] Attempting connection to service: ${profile.service}`);
        const service = await server.getPrimaryService(profile.service);
        const characteristic = await service.getCharacteristic(profile.characteristic);

        if (characteristic.properties.notify) {
          await characteristic.startNotifications();
          characteristic.addEventListener('characteristicvaluechanged', handleNotification);
        }
        characteristicRef.current = characteristic;

        // Request initial status
        try {
          const encoder = new TextEncoder();
          await characteristic.writeValue(encoder.encode('STATUS'));
        } catch (err) {
          console.warn('[BT] Send STATUS command failed:', err.message);
        }

        console.log(`[BT] Successfully subscribed to service: ${profile.service}`);
        success = true;
        break; // Found working service, exit loop!
      } catch (err) {
        lastError = err;
        console.info(`[BT] Profile ${profile.service} not active:`, err.message);
      }
    }

    if (!success) {
      console.warn('[BT] UART characteristics subscription failed. Operating without notifications.', lastError?.message);
    }
  }, [handleNotification]);

  // ─── Disconnection listener ────────────────────────────────────────────────
  const handleGattDisconnected = useCallback(() => {
    setIsConnected(false);
    setDeviceStatus(null);
    setDeviceInfo({ name: null, id: null });
    characteristicRef.current = null;
    serverRef.current = null;
  }, []);

  // ─── Handle incoming BLE notifications ─────────────────────────────────────
  const handleNotification = useCallback(
    (event) => {
      try {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        const raw = decoder.decode(value).trim();

        if (raw === 'F') {
          setDeviceStatus('F');
          return;
        }

        const parsed = JSON.parse(raw);
        if (onData && typeof onData === 'function') {
          onData({
            tiltAngle:     parseFloat(parsed.tiltAngle)     ?? 0,
            height:        parseFloat(parsed.height)        ?? 0,
            voltageStatus: Boolean(parsed.voltageStatus),
            batterySOC:    parseFloat(parsed.batterySOC)    ?? 0,
            timestamp:     new Date(),
          });
        }
      } catch {
        // Ignore parsing errors
      }
    },
    [onData]
  );

  // ─── Monitor Bluetooth availability ────────────────────────────────────────
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

  // ─── Disconnect ─────────────────────────────────────────────────────────────
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
      } catch { /* ignore */ }
      characteristicRef.current = null;
    }

    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }

    handleGattDisconnected();
  }, [handleNotification, handleGattDisconnected]);

  // ─── Auto disconnect on adapter disable ────────────────────────────────────
  useEffect(() => {
    if (!isBluetoothPoweredOn && isConnected) {
      disconnect();
      setError('Bluetooth has been turned OFF');
      if (onBluetoothPowerOffWhileConnected) {
        onBluetoothPowerOffWhileConnected();
      }
    }
  }, [isBluetoothPoweredOn, isConnected, disconnect, onBluetoothPowerOffWhileConnected]);

  // ─── Add / update a device in the discovered list ──────────────────────────
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
      // New device — notify caller
      if (onDeviceFound) onDeviceFound(name);
      return [...prev, entry];
    });
  }, [onDeviceFound]);

  /**
   * startScanning — opens the browser's native BLE device picker.
   *
   * `requestLEScan` is an experimental API that requires a Chrome flag and is
   * NOT available in production Chrome. The only reliable way to discover BLE
   * devices via Web Bluetooth is `requestDevice`, which shows the browser's
   * built-in chooser dialog. Each call adds the chosen device to the
   * discovered list so the user can keep scanning for more.
   */
  const startScanning = useCallback(async () => {
    if (!isBluetoothSupported) return;

    setError(null);
    setIsScanning(true);

    try {
      // Try experimental LE Scan API first (Chrome with flag enabled)
      if (navigator.bluetooth.requestLEScan) {
        try {
          const scan = await navigator.bluetooth.requestLEScan({
            acceptAllAdvertisements: true,
            keepRepeatedDevices: false,
          });

          // Listen for advertisement events
          const onAdvert = (event) => {
            const dev  = event.device;
            const rssi = event.rssi !== undefined ? event.rssi : -75;
            addDiscoveredDevice(dev, rssi);
          };
          navigator.bluetooth.addEventListener('advertisementreceived', onAdvert);

          // Auto-stop after 15 seconds
          setTimeout(() => {
            try { scan.stop(); } catch {}
            navigator.bluetooth.removeEventListener('advertisementreceived', onAdvert);
            setIsScanning(false);
          }, 15000);

          return; // LEScan is running — return early
        } catch (leScanErr) {
          // LEScan failed (flag not enabled, permission denied, etc.) — fall through
          console.info('[BT] requestLEScan not available, falling back to requestDevice picker:', leScanErr.message);
        }
      }

      // ── Fallback: requestDevice picker ──────────────────────────────────────
      // This is the ONLY universally-supported way to discover BLE devices.
      // It shows the browser's native chooser with ALL nearby BLE devices.
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: OPTIONAL_SERVICES,
      });

      // Simulate a realistic RSSI for display purposes
      const simulatedRssi = -(Math.floor(Math.random() * 40) + 50); // -50 to -90
      addDiscoveredDevice(device, simulatedRssi);

    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'AbortError') {
        // User cancelled — not an error
        console.info('[BT] User closed device picker without selecting a device.');
      } else {
        console.warn('[BT] Scan failed:', err.message);
        setError(err.message);
      }
    } finally {
      setIsScanning(false);
    }
  }, [isBluetoothSupported, isBluetoothPoweredOn, addDiscoveredDevice]);

  // ─── Stop Scanning ─────────────────────────────────────────────────────────
  const stopScanning = useCallback(() => {
    setIsScanning(false);
  }, []);

  // ─── Clear discovered devices list ─────────────────────────────────────────
  const clearDiscoveredDevices = useCallback(() => {
    knownDevicesRef.current.clear();
    setDiscoveredDevices([]);
  }, []);

  // ─── Clear devices list when Bluetooth turns off ───────────────────────────
  useEffect(() => {
    if (!isBluetoothPoweredOn) {
      stopScanning();
      clearDiscoveredDevices();
    }
  }, [isBluetoothPoweredOn, stopScanning, clearDiscoveredDevices]);

  // ─── Reconnection flow ─────────────────────────────────────────────────────
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

  // ─── Connect to a specific scanned device ──────────────────────────────────
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

  // ─── Legacy scanning picker (direct connect via native chooser) ───────────
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

      // Also add to discovered list
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

  // ─── Auto-reconnect when Bluetooth powers on ──────────────────────────────
  useEffect(() => {
    if (isBluetoothPoweredOn) {
      attemptAutoReconnect().catch(() => {});
    }
  }, [isBluetoothPoweredOn, attemptAutoReconnect]);

  // ─── Unified connectionStatus state machine ────────────────────────────────
  const connectionStatus = useMemo(() => {
    if (!isBluetoothSupported) return 'unsupported';
    if (!isBluetoothPoweredOn) return 'off';
    if (isConnecting)          return 'connecting';
    if (isReconnecting)        return 'reconnecting';
    if (isConnected)           return 'connected';
    if (isScanning)            return 'scanning';
    return 'disconnected';
  }, [isBluetoothSupported, isBluetoothPoweredOn, isConnecting, isReconnecting, isConnected, isScanning]);

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
    sendCommand,
    startScanning,
    stopScanning,
    clearDiscoveredDevices,
    isConnected,
    isScanning,
    isConnecting,
    isReconnecting,
    deviceInfo,
    error,
    deviceStatus,
    discoveredDevices,
    isBluetoothPoweredOn,
    connectionStatus,
    isBluetoothSupported,
  };
}
