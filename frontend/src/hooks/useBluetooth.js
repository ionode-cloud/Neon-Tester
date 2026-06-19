import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { BluetoothCommunication } from '@yesprasoon/capacitor-bluetooth-communication';

// ─── Platform detection ───────────────────────────────────────────────────────
const isNativePlatform = Capacitor.isNativePlatform();

// ─── Serial log cap ───────────────────────────────────────────────────────────
const MAX_SERIAL_LOG = 50;

// ─── IST date helper ─────────────────────────────────────────────────────────
const getISTDate = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000);

// ─── HC-05 / ESP32 SPP Data Parser ───────────────────────────────────────────
/**
 * Parses incoming serial string into a structured data object.
 * Supports two formats:
 *   JSON:      {"tiltAngle":15,"height":120,"voltageStatus":48.5,"batterySOC":82}
 *   Key=Value: TiltAngle:15,Height:120,VoltageStatus:48.5,BatterySOC:82
 *
 * Returns { tiltAngle, height, voltageStatus, batterySOC, timestamp } or null on failure.
 */
function parseHC05Data(raw) {
  console.log('[Classic-BT] Raw data received:', raw);

  if (!raw || typeof raw !== 'string') {
    console.error('[Classic-BT] Invalid raw data — not a string:', raw);
    return null;
  }

  const trimmed = raw.trim();

  // ── Attempt 1: JSON parse ─────────────────────────────────────────────────
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const result = {
        tiltAngle: parseFloat(parsed.tiltAngle ?? parsed.TiltAngle ?? 0),
        height: parseFloat(parsed.height ?? parsed.Height ?? 0),
        voltageStatus: parsed.voltageStatus !== undefined ? String(parsed.voltageStatus) : (parsed.VoltageStatus !== undefined ? String(parsed.VoltageStatus) : ''),
        batterySOC: parseFloat(parsed.batterySOC ?? parsed.BatterySOC ?? 0),
        timestamp: getISTDate(),
        rawData: raw,
      };
      console.log('  → Tilt Angle    :', result.tiltAngle, '°');
      console.log('  → Height        :', result.height, 'm');
      console.log('  → Voltage Status:', result.voltageStatus);
      console.log('  → Battery SOC   :', result.batterySOC, '%');
      return result;
    } catch (jsonErr) {
      console.warn('[Classic-BT] JSON parse failed, trying key=value format:', jsonErr.message);
    }
  }

  // ── Attempt 2: Key=Value parse (e.g. TiltAngle:15,Height:120,...) ──────────
  try {
    const pairs = {};
    trimmed.split(',').forEach(segment => {
      const colonIdx = segment.indexOf(':');
      if (colonIdx === -1) return;
      const key = segment.slice(0, colonIdx).trim().toLowerCase().replace(/[_\s-]/g, '');
      const val = segment.slice(colonIdx + 1).trim();
      pairs[key] = val;
    });

    const get = (...keys) => {
      for (const k of keys) {
        const normalized = k.toLowerCase().replace(/[_\s-]/g, '');
        if (pairs[normalized] !== undefined) return pairs[normalized];
      }
      return undefined;
    };

    const tiltRaw = get('tiltangle', 'tilt', 'angle');
    const heightRaw = get('height', 'ht');
    const voltageRaw = get('voltagestatus', 'voltage', 'volt', 'vs');
    const batteryRaw = get('batterysoc', 'battery', 'batt', 'soc');

    if (tiltRaw === undefined && heightRaw === undefined && voltageRaw === undefined && batteryRaw === undefined) {
      console.error('[Classic-BT] Key=Value parse failed — no recognizable fields. Keys found:', Object.keys(pairs));
      return null;
    }

    const result = {
      tiltAngle: tiltRaw !== undefined ? parseFloat(tiltRaw) : 0,
      height: heightRaw !== undefined ? parseFloat(heightRaw) : 0,
      voltageStatus: voltageRaw !== undefined ? String(voltageRaw) : '',
      batterySOC: batteryRaw !== undefined ? parseFloat(batteryRaw) : 0,
      timestamp: getISTDate(),
      rawData: raw,
    };

    if (isNaN(result.tiltAngle) || isNaN(result.height) || isNaN(result.batterySOC)) {
      console.error('[Classic-BT] Key=Value parse produced NaN values:', result);
      return null;
    }

    console.log('  → Tilt Angle    :', result.tiltAngle, '°');
    console.log('  → Height        :', result.height, 'm');
    console.log('  → Voltage Status:', result.voltageStatus);
    console.log('  → Battery SOC   :', result.batterySOC, '%');
    return result;
  } catch (kvErr) {
    console.error('[Classic-BT] Key=Value parse failed with error:', kvErr.message);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// BLUETOOTH CLASSIC HOOK (uses @yesprasoon/capacitor-bluetooth-communication)
// Supports HC-05, HC-06, ESP32 SPP, and all RFCOMM/SPP serial devices.
// ═══════════════════════════════════════════════════════════════════════════════

export default function useBluetooth({
  onData,
  onBluetoothPowerOffWhileConnected,
  onReconnectSuccess,
  onDeviceFound,
  onBluetoothEnabled,
  onBluetoothDisabled,
} = {}) {

  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState({ name: null, id: null });
  const [error, setError] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [isBluetoothPoweredOn, setIsBluetoothPoweredOn] = useState(true);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [serialLog, setSerialLog] = useState([]); // { timestamp, raw, parsed }

  const connectedAddressRef = useRef(null); // MAC address of connected device
  const btInitializedRef = useRef(false);
  const fetchResolveRef = useRef(null);
  const fetchRejectRef = useRef(null);
  const dataListenerRef = useRef(null);

  // Web Serial and Mock refs
  const selectedWebSerialPortRef = useRef(null);
  const webSerialReaderRef = useRef(null);
  const webSerialKeepReadingRef = useRef(true);
  const simulatedDataIntervalRef = useRef(null);

  // Always considered "supported" — on web, methods return stubs gracefully
  const isBluetoothSupported = true;

  // ── Append to serial monitor log ─────────────────────────────────────────
  const appendSerialLog = useCallback((raw, parsed) => {
    const entry = {
      timestamp: new Date(),
      raw,
      parsed,
    };
    setSerialLog(prev => {
      const updated = [...prev, entry];
      return updated.length > MAX_SERIAL_LOG ? updated.slice(-MAX_SERIAL_LOG) : updated;
    });
  }, []);

  // Keep onData callback fresh in the listener (via stable ref trick)
  const onDataRef = useRef(onData);
  useEffect(() => { onDataRef.current = onData; }, [onData]);

  // ── Read from Web Serial Port (Web Fallback) ─────────────────────────────
  const readFromWebSerial = useCallback(async (port) => {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (port.readable && webSerialKeepReadingRef.current) {
        const reader = port.readable.getReader();
        webSerialReaderRef.current = reader;

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              console.log('[Web Serial] Reader closed (done)');
              break;
            }
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // Process completed lines
              let newlineIdx;
              while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIdx).trim();
                buffer = buffer.slice(newlineIdx + 1);

                if (line) {
                  console.log('[Web Serial] Decoded line:', line);

                  // Check status flags
                  if (line === 'F' || line === 'OK' || line === 'READY') {
                    setDeviceStatus(line);
                    appendSerialLog(line, null);
                  } else if (fetchResolveRef.current) {
                    const resolve = fetchResolveRef.current;
                    fetchResolveRef.current = null;
                    fetchRejectRef.current = null;
                    resolve(line);
                    appendSerialLog(line, null);
                  } else {
                    const parsed = parseHC05Data(line);
                    appendSerialLog(line, parsed);
                    if (parsed && onDataRef.current) {
                      onDataRef.current(parsed);
                    }
                  }
                }
              }
            }
          }
        } catch (readErr) {
          console.error('[Web Serial] Read error:', readErr);
        } finally {
          reader.releaseLock();
          webSerialReaderRef.current = null;
        }
      }
    } catch (err) {
      console.error('[Web Serial] Reader setup error:', err);
    }
  }, [appendSerialLog]);

  // ── Initialize Bluetooth Classic plugin once ──────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        await BluetoothCommunication.initialize();
        btInitializedRef.current = true;
      } catch (err) {
        console.warn('[Classic-BT] Initialize warning (web stub?):', err.message);
        // Still mark as initialized so web dev mode works
        btInitializedRef.current = true;
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Attach data listener once (persists for the session) ─────────────────
  useEffect(() => {
    const setupListener = async () => {
      try {
        const handle = await BluetoothCommunication.addListener('dataReceived', (event) => {
          const raw = typeof event === 'string' ? event : (event?.data ?? event?.message ?? JSON.stringify(event));
          console.log('[Classic-BT] dataReceived event — raw:', raw);

          // Device status flags
          if (raw === 'F' || raw === 'OK' || raw === 'READY') {
            console.log('[Classic-BT] Device status flag:', raw);
            setDeviceStatus(raw);
            appendSerialLog(raw, null);
            return;
          }

          // Pending fetchData promise
          if (fetchResolveRef.current) {
            const resolve = fetchResolveRef.current;
            fetchResolveRef.current = null;
            fetchRejectRef.current = null;
            resolve(raw);
            appendSerialLog(raw, null); // log raw; caller parses
            return;
          }

          // Live streaming data
          const parsed = parseHC05Data(raw);
          appendSerialLog(raw, parsed);

          if (parsed && onDataRef.current) {
            console.log('[Classic-BT] Streaming data — calling onData callback');
            onDataRef.current(parsed);
          } else if (!parsed) {
            console.warn('[Classic-BT] Could not parse streaming data — logged raw only');
          }
        });
        dataListenerRef.current = handle;
        console.log('[Classic-BT] dataReceived listener attached');
      } catch (err) {
        console.warn('[Classic-BT] addListener warning (web stub?):', err.message);
      }
    };

    setupListener();

    return () => {
      // Clean up listener on unmount
      if (dataListenerRef.current) {
        try {
          dataListenerRef.current.remove();
        } catch { /* ignore */ }
        dataListenerRef.current = null;
      }
    };
  }, [appendSerialLog]);

  // Clean up serial interfaces and intervals on unmount
  useEffect(() => {
    return () => {
      if (simulatedDataIntervalRef.current) {
        clearInterval(simulatedDataIntervalRef.current);
      }
      webSerialKeepReadingRef.current = false;
      if (webSerialReaderRef.current) {
        try {
          webSerialReaderRef.current.cancel();
        } catch { /* ignore */ }
      }
    };
  }, []);

  // ── Disconnect handler ────────────────────────────────────────────────────
  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setDeviceStatus(null);
    setDeviceInfo({ name: null, id: null });
    connectedAddressRef.current = null;

    if (fetchRejectRef.current) {
      fetchRejectRef.current(new Error('Device disconnected during fetch'));
      fetchResolveRef.current = null;
      fetchRejectRef.current = null;
    }
  }, []);

  // ── Scan: load all paired Bluetooth Classic devices ──────────────────────
  const startScanning = useCallback(async () => {
    setError(null);
    setIsScanning(true);
    setDiscoveredDevices([]);

    try {
      if (isNativePlatform) {
        // On native Android: returns paired devices from BluetoothAdapter.getBondedDevices()
        const result = await BluetoothCommunication.scanDevices();
        const devices = result?.devices ?? [];

        console.log('[Classic-BT] Paired devices found:', devices.length);

        const mapped = devices.map(d => ({
          id: d.address,       // MAC address used as unique ID
          name: d.name || `Device (${d.address})`,
          address: d.address,
          rssi: -70,             // Classic BT doesn't expose RSSI during pairing scan
        }));

        setDiscoveredDevices(mapped);

        if (devices.length === 0) {
          console.info('[Classic-BT] No paired devices found. Pair devices in Android Settings first.');
        } else {
          mapped.forEach(d => {
            if (onDeviceFound) onDeviceFound(d.name);
          });
        }
        return null;
      } else {
        // On web browser fallback: Check for Web Serial support
        console.log('[Web] startScanning triggered.');
        if ('serial' in navigator) {
          try {
            console.log('[Web] Requesting Web Serial port…');
            const port = await navigator.serial.requestPort();
            selectedWebSerialPortRef.current = port;

            const dev = {
              id: 'web-serial-port',
              name: 'HC-05 (Web Serial)',
              address: 'COM Port',
              isWebSerial: true
            };
            if (onDeviceFound) onDeviceFound(dev.name);
            return dev;
          } catch (serialErr) {
            console.warn('[Web] Web Serial request cancelled or failed:', serialErr.message);
            return null;
          }
        } else {
          console.info('[Web] Web Serial not supported.');
          setError('Web Serial is not supported in this browser. Please use Chrome/Edge or the Android app.');
          return null;
        }
      }
    } catch (err) {
      console.error('[Classic-BT] scanDevices failed:', err.message);
      if (!err.message?.toLowerCase().includes('web') && !err.message?.toLowerCase().includes('stub')) {
        setError(err.message);
      }
      return null;
    } finally {
      setIsScanning(false);
    }
  }, [onDeviceFound]);


  const stopScanning = useCallback(() => {
    setIsScanning(false);
  }, []);

  const clearDiscoveredDevices = useCallback(() => {
    setDiscoveredDevices([]);
  }, []);


  // ── Connect to a specific device by MAC address / Web Serial / Mock ───────
  const connectDevice = useCallback(async (device) => {
    const address = device.address ?? device.id;
    const name = device.name || `Device (${address})`;

    if (!address) {
      setError('No device address provided');
      return null;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log(`[Classic-BT] Connecting to ${name} (${address})…`);

      let finalName = name;
      let finalId = address;

      if (isNativePlatform) {
        await BluetoothCommunication.connect({ address });
        connectedAddressRef.current = address;
        setIsConnected(true);
        setDeviceInfo({ name, id: address });

        // Send STATUS command
        try {
          await BluetoothCommunication.sendData({ data: 'STATUS\n' });
          console.log('[Classic-BT] Sent STATUS command');
        } catch { /* non-fatal */ }

      } else if (device.isWebSerial) {
        let port = selectedWebSerialPortRef.current;
        if (!port && 'serial' in navigator) {
          try {
            const ports = await navigator.serial.getPorts();
            if (ports && ports.length > 0) {
              port = ports[0];
              selectedWebSerialPortRef.current = port;
            }
          } catch (portErr) {
            console.warn('[Web Serial] Failed to retrieve paired ports:', portErr);
          }
        }
        if (!port) {
          throw new Error('No serial port selected. Please scan again.');
        }

        console.log('[Web Serial] Opening port at 9600 baud…');
        await port.open({ baudRate: 9600 });

        connectedAddressRef.current = 'web-serial';
        setIsConnected(true);

        // Determine friendly name and ID based on port info
        let webSerialName = 'Web Serial Device';
        let webSerialId = 'web-serial';
        try {
          const info = port.getInfo();
          if (info && info.usbVendorId !== undefined && info.usbProductId !== undefined) {
            const vidHex = info.usbVendorId.toString(16).padStart(4, '0').toUpperCase();
            const pidHex = info.usbProductId.toString(16).padStart(4, '0').toUpperCase();
            webSerialId = `${vidHex}:${pidHex}`;

            let chipName = 'USB Serial';
            if (info.usbVendorId === 0x1A86) chipName = 'CH340 USB Serial';
            else if (info.usbVendorId === 0x0403) chipName = 'FTDI USB Serial';
            else if (info.usbVendorId === 0x10C4) chipName = 'CP210x USB Serial';
            else if (info.usbVendorId === 0x067B) chipName = 'PL2303 USB Serial';
            else if (info.usbVendorId === 0x2341 || info.usbVendorId === 0x9025) chipName = 'Arduino USB Serial';

            webSerialName = `${chipName} (${vidHex}:${pidHex})`;
          }
        } catch (infoErr) {
          console.warn('[Web Serial] Failed to get port info:', infoErr);
        }

        setDeviceInfo({ name: webSerialName, id: webSerialId });
        finalName = webSerialName;
        finalId = webSerialId;

        // Start reading loop
        webSerialKeepReadingRef.current = true;
        readFromWebSerial(port);

        // Send STATUS handshake
        try {
          const writer = port.writable.getWriter();
          await writer.write(new TextEncoder().encode('STATUS\n'));
          writer.releaseLock();
          console.log('[Web Serial] Sent STATUS command');
        } catch (writeErr) {
          console.warn('[Web Serial] Failed to send STATUS:', writeErr.message);
        }

      } else {
        // Mock connection
        await new Promise(resolve => setTimeout(resolve, 1000));

        connectedAddressRef.current = address;
        setIsConnected(true);
        setDeviceInfo({ name, id: address });

        if (simulatedDataIntervalRef.current) {
          clearInterval(simulatedDataIntervalRef.current);
          simulatedDataIntervalRef.current = null;
        }
        console.log('[Mock-BT] Connected in mock mode (no simulated telemetry generation)');
      }

      setIsConnecting(false);
      localStorage.setItem('lastConnectedDevice', JSON.stringify({
        id: finalId,
        name: finalName,
        address,
        isWebSerial: !!device.isWebSerial,
        isMock: !device.isWebSerial && !isNativePlatform
      }));

      return { name: finalName, id: finalId };
    } catch (err) {
      setIsConnecting(false);
      console.error('[Classic-BT] Connect failed:', err.message);
      setError(err.message);
      return null;
    }
  }, [appendSerialLog, readFromWebSerial]);



  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (simulatedDataIntervalRef.current) {
      clearInterval(simulatedDataIntervalRef.current);
      simulatedDataIntervalRef.current = null;
    }

    webSerialKeepReadingRef.current = false;
    if (webSerialReaderRef.current) {
      try {
        await webSerialReaderRef.current.cancel();
      } catch { /* ignore */ }
      webSerialReaderRef.current = null;
    }

    if (selectedWebSerialPortRef.current) {
      try {
        await selectedWebSerialPortRef.current.close();
      } catch (err) {
        console.warn('[Web Serial] Port close error:', err.message);
      }
      selectedWebSerialPortRef.current = null;
    }

    if (isNativePlatform && connectedAddressRef.current) {
      try {
        await BluetoothCommunication.disconnect();
        console.log('[Classic-BT] Disconnected');
      } catch (err) {
        console.warn('[Classic-BT] Disconnect error:', err.message);
      }
    }

    handleDisconnect();
  }, [handleDisconnect]);


  // ── Reconnect ─────────────────────────────────────────────────────────────
  const reconnect = useCallback(async () => {
    const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
    if (!lastDeviceStr) {
      setError('No previously paired device found. Please scan to pair again.');
      return null;
    }

    const lastDevice = JSON.parse(lastDeviceStr);

    setIsReconnecting(true);
    setError(null);

    try {
      const result = await connectDevice(lastDevice);
      setIsReconnecting(false);

      if (result) {
        if (onReconnectSuccess) onReconnectSuccess(result.name);
        return result;
      } else {
        throw new Error('Reconnect failed');
      }
    } catch (err) {
      console.warn('[Classic-BT] Reconnect failed:', err.message);
      setError('Could not reconnect. The device may be out of range.');
      setIsReconnecting(false);
      return null;
    }
  }, [connectDevice, onReconnectSuccess]);


  // ── Fetch Data — sends GET_DATA command, waits for response ──────────────
  const fetchData = useCallback(async () => {
    if (!connectedAddressRef.current) {
      console.error('[Classic-BT] fetchData called but no device is connected');
      throw new Error('No device connected');
    }

    console.log('[Classic-BT] Fetch Data initiated — sending GET_DATA command');
    setIsFetchingData(true);

    return new Promise((resolve, reject) => {
      fetchResolveRef.current = resolve;
      fetchRejectRef.current = reject;

      const sendCommandLocal = async () => {
        try {
          const cmd = 'GET_DATA\n';
          if (isNativePlatform) {
            await BluetoothCommunication.sendData({ data: cmd });
            console.log('[Classic-BT] ✓ GET_DATA command sent — waiting for response…');
          } else if (connectedAddressRef.current === 'web-serial' && selectedWebSerialPortRef.current) {
            const writer = selectedWebSerialPortRef.current.writable.getWriter();
            await writer.write(new TextEncoder().encode(cmd));
            writer.releaseLock();
            console.log('[Web Serial] ✓ GET_DATA command sent — waiting for response…');
          } else {
            console.log('[Mock-BT] Mock GET_DATA requested (no-op)');
            if (fetchResolveRef.current) {
              const res = fetchResolveRef.current;
              fetchResolveRef.current = null;
              fetchRejectRef.current = null;
              res("");
            }
          }
        } catch (primaryErr) {
          console.warn('[Classic-BT] GET_DATA failed, retrying with FETCH:', primaryErr.message);
          try {
            const fallbackCmd = 'FETCH\n';
            if (isNativePlatform) {
              await BluetoothCommunication.sendData({ data: fallbackCmd });
            } else if (connectedAddressRef.current === 'web-serial' && selectedWebSerialPortRef.current) {
              const writer = selectedWebSerialPortRef.current.writable.getWriter();
              await writer.write(new TextEncoder().encode(fallbackCmd));
              writer.releaseLock();
            }
          } catch (fallbackErr) {
            console.warn('[Classic-BT] Both commands failed:', fallbackErr.message);
          }
        }
      };
      sendCommandLocal();

      const TIMEOUT_MS = 5000;
      const timerLocal = setTimeout(() => {
        if (fetchResolveRef.current) {
          fetchResolveRef.current = null;
          fetchRejectRef.current = null;
          console.error(`[Classic-BT] ✗ No response within ${TIMEOUT_MS / 1000}s — timeout`);
          reject(new Error(`No data received within ${TIMEOUT_MS / 1000} seconds`));
        }
      }, TIMEOUT_MS);

      const origResolve = resolve;
      fetchResolveRef.current = (val) => {
        clearTimeout(timerLocal);
        console.log('[Classic-BT] ✓ Response received');
        origResolve(val);
      };
    }).finally(() => {
      setIsFetchingData(false);
    });
  }, [appendSerialLog]);


  const parseFetchedData = useCallback((raw) => {
    return parseHC05Data(raw);
  }, []);


  // ── Send Command ──────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (command) => {
    const formatted = command.endsWith('\n') ? command : command + '\n';

    if (isNativePlatform) {
      if (!connectedAddressRef.current) return;
      try {
        await BluetoothCommunication.sendData({ data: formatted });
        console.log('[Classic-BT] Sent command:', command);
      } catch (err) {
        console.warn('[Classic-BT] Send command failed:', err.message);
      }
    } else if (connectedAddressRef.current === 'web-serial' && selectedWebSerialPortRef.current) {
      try {
        const writer = selectedWebSerialPortRef.current.writable.getWriter();
        await writer.write(new TextEncoder().encode(formatted));
        writer.releaseLock();
        console.log('[Web Serial] Sent command:', command);
        appendSerialLog(`Sent: ${command}`, null);
      } catch (err) {
        console.warn('[Web Serial] Send command failed:', err.message);
      }
    }
  }, [appendSerialLog]);


  // ── Clear serial log ──────────────────────────────────────────────────────
  const clearSerialLog = useCallback(() => {
    setSerialLog([]);
  }, []);


  // ── Connection status string ──────────────────────────────────────────────
  const connectionStatus = useMemo(() => {
    if (!isBluetoothPoweredOn) return 'off';
    if (isConnecting) return 'connecting';
    if (isReconnecting) return 'reconnecting';
    if (isFetchingData) return 'fetching';
    if (isConnected) return 'connected';
    if (isScanning) return 'scanning';
    return 'disconnected';
  }, [isBluetoothPoweredOn, isConnecting, isReconnecting, isFetchingData, isConnected, isScanning]);


  return {
    // Actions
    connectDevice,
    disconnect,
    reconnect,
    sendCommand,
    fetchData,
    parseFetchedData,
    startScanning,
    stopScanning,
    clearDiscoveredDevices,
    clearSerialLog,

    // State
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

    // Serial monitor
    serialLog,
  };
}
