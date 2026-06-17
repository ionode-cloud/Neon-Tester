import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { BluetoothCommunication } from '@yesprasoon/capacitor-bluetooth-communication';

// ─── Platform detection ───────────────────────────────────────────────────────
const isNativePlatform = Capacitor.isNativePlatform();

// ─── Serial log cap ───────────────────────────────────────────────────────────
const MAX_SERIAL_LOG = 50;

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
        voltageStatus: !!(parsed.voltageStatus ?? parsed.VoltageStatus ?? false),
        batterySOC: parseFloat(parsed.batterySOC ?? parsed.BatterySOC ?? 0),
        timestamp: new Date(),
      };
      console.log('  → Tilt Angle    :', result.tiltAngle, '°');
      console.log('  → Height        :', result.height, 'm');
      console.log('  → Voltage Status:', result.voltageStatus ? 'Active' : 'Inactive');
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
      voltageStatus: voltageRaw !== undefined
        ? (voltageRaw === 'true' || voltageRaw === '1' || voltageRaw === true)
        : false,
      batterySOC: batteryRaw !== undefined ? parseFloat(batteryRaw) : 0,
      timestamp: new Date(),
    };

    if (isNaN(result.tiltAngle) || isNaN(result.height) || isNaN(result.batterySOC)) {
      console.error('[Classic-BT] Key=Value parse produced NaN values:', result);
      return null;
    }

    console.log('  → Tilt Angle    :', result.tiltAngle, '°');
    console.log('  → Height        :', result.height, 'm');
    console.log('  → Voltage Status:', result.voltageStatus ? 'Active' : 'Inactive');
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

  const loadMockDevices = useCallback(() => {
    const mocks = [
      { id: 'mock-hc05', name: 'HC-05 (Simulated)', address: '98:D3:31:F4:12:3C', isMock: true },
      { id: 'mock-hc06', name: 'HC-06 (Simulated)', address: '00:18:E4:35:0F:12', isMock: true },
      { id: 'mock-esp32', name: 'ESP32-SPP (Simulated)', address: '24:0A:C4:8B:58:A2', isMock: true },
    ];
    setDiscoveredDevices(mocks);
    mocks.forEach(m => {
      if (onDeviceFound) onDeviceFound(m.name);
    });
  }, [onDeviceFound]);


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
              address: 'COM Port (Select to connect)',
              isWebSerial: true
            };
            setDiscoveredDevices([dev]);
            if (onDeviceFound) onDeviceFound(dev.name);
          } catch (serialErr) {
            console.warn('[Web] Web Serial request cancelled or failed:', serialErr.message);
            // Fall back to Mock devices if cancelled/failed
            loadMockDevices();
          }
        } else {
          console.info('[Web] Web Serial not supported. Falling back to mock devices.');
          loadMockDevices();
        }
      }
    } catch (err) {
      console.error('[Classic-BT] scanDevices failed:', err.message);
      if (!err.message?.toLowerCase().includes('web') && !err.message?.toLowerCase().includes('stub')) {
        setError(err.message);
      }
    } finally {
      setIsScanning(false);
    }
  }, [onDeviceFound, loadMockDevices]);


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
        const port = selectedWebSerialPortRef.current;
        if (!port) {
          throw new Error('No serial port selected. Please scan again.');
        }

        console.log('[Web Serial] Opening port at 9600 baud…');
        await port.open({ baudRate: 9600 });

        connectedAddressRef.current = 'web-serial';
        setIsConnected(true);
        setDeviceInfo({ name: 'HC-05 (Web Serial)', id: 'web-serial' });

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
        }

        simulatedDataIntervalRef.current = setInterval(() => {
          const mockData = {
            tiltAngle: parseFloat((5 + Math.random() * 20).toFixed(1)),
            height: parseFloat((100 + Math.random() * 30).toFixed(1)),
            voltageStatus: Math.random() > 0.3,
            batterySOC: Math.max(0, Math.min(100, Math.round(80 - (Date.now() % 100000) / 10000))),
            timestamp: new Date()
          };
          const rawLine = JSON.stringify({
            tiltAngle: mockData.tiltAngle,
            height: mockData.height,
            voltageStatus: mockData.voltageStatus,
            batterySOC: mockData.batterySOC
          });
          console.log('[Mock-BT] Simulated raw line:', rawLine);
          appendSerialLog(rawLine, mockData);
          if (onDataRef.current) onDataRef.current(mockData);
        }, 2000);
      }

      setIsConnecting(false);
      localStorage.setItem('lastConnectedDevice', JSON.stringify({
        id: address,
        name,
        address,
        isWebSerial: !!device.isWebSerial,
        isMock: !device.isWebSerial && !isNativePlatform
      }));

      return { name, id: address };
    } catch (err) {
      setIsConnecting(false);
      console.error('[Classic-BT] Connect failed:', err.message);
      setError(err.message);
      return null;
    }
  }, [appendSerialLog, readFromWebSerial]);


  // ── connect() — directly scans and connects to a device, returning connection result ──
  const connect = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      if (isNativePlatform) {
        const result = await BluetoothCommunication.scanDevices();
        const devices = result?.devices ?? [];
        if (devices.length === 0) {
          throw new Error('No paired Bluetooth Classic devices found. Please pair your HC-05/ESP32 in Android Settings first.');
        }

        // Try to reconnect to last used device if it is still paired, else pick the first paired device
        const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
        let targetDevice = devices[0];
        if (lastDeviceStr) {
          try {
            const lastDevice = JSON.parse(lastDeviceStr);
            const match = devices.find(d => d.address === lastDevice.address);
            if (match) targetDevice = match;
          } catch { /* ignore */ }
        }

        const mappedDev = {
          id: targetDevice.address,
          name: targetDevice.name || `Device (${targetDevice.address})`,
          address: targetDevice.address
        };

        return await connectDevice(mappedDev);
      } else {
        // Web browser: Try Web Serial
        if ('serial' in navigator) {
          try {
            console.log('[Web Serial] Requesting port…');
            const port = await navigator.serial.requestPort();
            selectedWebSerialPortRef.current = port;

            const dev = {
              id: 'web-serial-port',
              name: 'HC-05 (Web Serial)',
              address: 'COM Port',
              isWebSerial: true
            };

            return await connectDevice(dev);
          } catch (serialErr) {
            console.warn('[Web Serial] Request cancelled or failed, connecting to mock:', serialErr.message);
            // Fall back to Mock HC-05 directly
            const mockDev = { id: 'mock-hc05', name: 'HC-05 (Simulated)', address: '98:D3:31:F4:12:3C', isMock: true };
            return await connectDevice(mockDev);
          }
        } else {
          // No serial support: Connect to Mock directly
          console.info('[Web] Web Serial not supported, connecting to mock.');
          const mockDev = { id: 'mock-hc05', name: 'HC-05 (Simulated)', address: '98:D3:31:F4:12:3C', isMock: true };
          return await connectDevice(mockDev);
        }
      }
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [isNativePlatform, connectDevice]);


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


  // ── Auto-reconnect on startup ─────────────────────────────────────────────
  useEffect(() => {
    const autoReconnect = async () => {
      const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
      if (!lastDeviceStr) return;
      const lastDevice = JSON.parse(lastDeviceStr);

      try {
        setIsReconnecting(true);
        console.log('[Classic-BT] Auto-reconnect attempt to:', lastDevice.name);
        await connectDevice(lastDevice);
      } catch (err) {
        console.warn('[Classic-BT] Auto-reconnect failed:', err.message);
      } finally {
        setIsReconnecting(false);
      }
    };

    // Small delay to let plugin initialize
    const timer = setTimeout(autoReconnect, 1500);
    return () => clearTimeout(timer);
  }, [connectDevice]);


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
            console.log('[Mock-BT] Simulated GET_DATA request…');
            setTimeout(() => {
              const mockVal = {
                tiltAngle: parseFloat((5 + Math.random() * 20).toFixed(1)),
                height: parseFloat((100 + Math.random() * 30).toFixed(1)),
                voltageStatus: Math.random() > 0.3,
                batterySOC: Math.max(0, Math.min(100, Math.round(80 - (Date.now() % 100000) / 10000))),
                timestamp: new Date()
              };
              const rawLine = JSON.stringify({
                tiltAngle: mockVal.tiltAngle,
                height: mockVal.height,
                voltageStatus: mockVal.voltageStatus,
                batterySOC: mockVal.batterySOC
              });
              if (fetchResolveRef.current) {
                const res = fetchResolveRef.current;
                fetchResolveRef.current = null;
                fetchRejectRef.current = null;
                res(rawLine);
                appendSerialLog(rawLine, null);
              }
            }, 800);
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
    } else if (connectedAddressRef.current) {
      console.log('[Mock-BT] Received command:', command);
      appendSerialLog(`Sent: ${command}`, null);

      if (command.trim() === 'GET_DATA' || command.trim() === 'FETCH') {
        setTimeout(() => {
          const mockVal = {
            tiltAngle: parseFloat((5 + Math.random() * 20).toFixed(1)),
            height: parseFloat((100 + Math.random() * 30).toFixed(1)),
            voltageStatus: Math.random() > 0.3,
            batterySOC: Math.max(0, Math.min(100, Math.round(80 - (Date.now() % 100000) / 10000))),
            timestamp: new Date()
          };
          const rawLine = JSON.stringify({
            tiltAngle: mockVal.tiltAngle,
            height: mockVal.height,
            voltageStatus: mockVal.voltageStatus,
            batterySOC: mockVal.batterySOC
          });

          if (fetchResolveRef.current) {
            const resolve = fetchResolveRef.current;
            fetchResolveRef.current = null;
            fetchRejectRef.current = null;
            resolve(rawLine);
            appendSerialLog(rawLine, null);
          }
        }, 500);
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
