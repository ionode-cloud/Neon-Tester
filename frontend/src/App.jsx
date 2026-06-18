import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

import useBluetooth from './hooks/useBluetooth';
import useSocket from './hooks/useSocket';
import useLocation from './hooks/useLocation';
import useAppUpdate from './hooks/useAppUpdate';
import { deviceApi } from './services/api';

import Header from './components/Header';
import ConnectionScreen from './components/ConnectionScreen';
import Dashboard from './components/Dashboard';
import CloudDataView from './components/CloudDataView';
import UpdateModal from './components/UpdateModal';

const isNativePlatform = Capacitor.isNativePlatform();
import BluetoothScanModal from './components/BluetoothScanModal';


export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [isCloudDataView, setIsCloudDataView] = useState(false);
  const [pairTime, setPairTime] = useState(null);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  // ── OTA Update system ───────────────────────────────────────────────────
  const {
    updateInfo,
    isDownloading,
    isInstalling,
    downloadProgress,
    error: updateError,
    dismissUpdate,
    triggerUpdate,
  } = useAppUpdate();

  // showDashboard stays TRUE after first successful connect.
  // Only the Exit button sets it back to false.
  const [showDashboard, setShowDashboard] = useState(() => {
    return !!localStorage.getItem('lastConnectedDevice');
  });

  // fetchData result state (managed at App level so Dashboard can read it)
  const [fetchDataResult, setFetchDataResult] = useState(null);
  const [fetchDataError, setFetchDataError] = useState(null);
  const [localDeviceData, setLocalDeviceData] = useState(null);

  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'clouddata') {
      setIsCloudDataView(true);
    }
  }, []);


  const {
    deviceData,
    lastCreated,
    lastUpdated: lastUpdatedEvent,
    lastDeleted,
    lastAllDeleted,
    isSocketConnected,
    emitBluetoothData,
    emitDeviceConnected,
    emitDeviceDisconnected,
  } = useSocket();


  const latestLocationRef = useRef(null);
  const latestDeviceInfoRef = useRef({ name: null, id: null });

  const handleBluetoothData = useCallback(
    async (data) => {
      const currentLoc = latestLocationRef.current;
      const devInfo = latestDeviceInfoRef.current;
      const dataWithLoc = {
        ...data,
        deviceId: devInfo.id || 'web-device',
        latitude: currentLoc ? currentLoc.lat : null,
        longitude: currentLoc ? currentLoc.lng : null,
        _receivedAt: Date.now(),
      };
      setLocalDeviceData(dataWithLoc);
      try {
        await deviceApi.postData(dataWithLoc);
      } catch (err) {
        console.warn('[App] Direct API post failed, falling back to socket:', err.message);
        emitBluetoothData(dataWithLoc);
      }
    },
    [emitBluetoothData]
  );

  const {
    connectDevice,
    disconnect,
    reconnect,
    sendCommand,
    fetchData,
    parseFetchedData,
    startScanning,
    startScanningBLE,
    clearDiscoveredDevices,
    clearSerialLog,
    isConnected: btConnected,
    isScanning,
    isConnecting,
    isReconnecting,
    isFetchingData,
    deviceInfo: btDeviceInfo,
    error: btError,
    discoveredDevices,
    isBluetoothPoweredOn,
    connectionStatus,
    isBluetoothSupported,
    serialLog,
  } = useBluetooth({
    onData: handleBluetoothData,
    onBluetoothPowerOffWhileConnected: () => {
      showToast('Bluetooth has been turned OFF mid-connection!', 'error');
    },
    onReconnectSuccess: async (name) => {
      showToast(`Reconnected successfully to ${name}!`, 'success');
      const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
      if (lastDeviceStr) {
        try {
          const lastDevice = JSON.parse(lastDeviceStr);
          await deviceApi.connect({ deviceName: name, deviceId: lastDevice.id });
          emitDeviceConnected({ deviceName: name, deviceId: lastDevice.id });
        } catch (err) {
          console.warn('[BT] Failed to report reconnect to backend:', err);
        }
      }
      setShowDashboard(true);
    },
    onDeviceFound: (name) => {
      showToast(`Device found: ${name}`, 'info');
    },
    onBluetoothEnabled: () => {
      showToast('Bluetooth Enabled', 'success');
    },
    onBluetoothDisabled: () => {
      showToast('Bluetooth Disabled', 'error');
    }
  });


  const { location, error: locationError, loading: locationLoading } = useLocation({
    enabled: btConnected || showDashboard,
  });
  latestLocationRef.current = location;

  // Prefer live BT device info; fall back to what was saved in localStorage
  const deviceInfo = useMemo(() => {
    if (btConnected) return btDeviceInfo;
    const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
    if (lastDeviceStr) {
      try {
        return JSON.parse(lastDeviceStr);
      } catch {
        return { name: null, id: null };
      }
    }
    return { name: null, id: null };
  }, [btConnected, btDeviceInfo]);

  useEffect(() => {
    latestDeviceInfoRef.current = deviceInfo;
  }, [deviceInfo]);

  const lastUpdated = deviceData?.timestamp ?? deviceData?._receivedAt;





  // ── Fetch Data — sends GET_DATA command and waits for HC-05 response ───────
  const handleFetchData = useCallback(async () => {
    console.log('[App] handleFetchData triggered — requesting data from HC-05');
    setFetchDataResult(null);
    setFetchDataError(null);
    try {
      const raw = await fetchData();
      console.log('[App] Raw data returned from fetchData():', raw);

      // Parse HC-05 response (supports JSON and key=value formats)
      const parsed = parseFetchedData(raw);

      if (parsed) {
        console.log('[App] Parsed HC-05 data — updating dashboard KPI cards:', parsed);
        // Route through handleBluetoothData so KPI cards update immediately
        // and the reading is saved to MongoDB via Socket.IO
        await handleBluetoothData(parsed);
        setFetchDataResult(parsed);
        showToast('Data fetched and saved to Cloud Database!', 'success');
      } else {
        // Parser returned null — invalid data format
        const errMsg = 'Invalid data format received from HC-05';
        console.error('[App]', errMsg, '| raw:', raw);
        setFetchDataError(errMsg);
        // Still show raw string in result box
        setFetchDataResult({ _raw: raw });
        showToast(errMsg, 'error');
      }
    } catch (err) {
      console.error('[App] Fetch Data error:', err.message);
      setFetchDataError(err.message);
      showToast(`Fetch failed: ${err.message}`, 'error');
    }
  }, [fetchData, parseFetchedData, handleBluetoothData, showToast]);


  // ── Connect to a discovered device (from scan list) ──────────────────────
  const handleConnectDevice = useCallback(async (dev) => {
    setIsScanModalOpen(false);
    showToast(`Connecting to ${dev.name}...`, 'info');
    const result = await connectDevice(dev);

    if (result) {
      showToast(`Connected to ${result.name}!`, 'success');
      setPairTime(new Date());
      setShowDashboard(true);
      await deviceApi.connect({ deviceName: result.name, deviceId: result.id });
      emitDeviceConnected({ deviceName: result.name, deviceId: result.id });

      // Automatically fetch data after connection
      try {
        await handleFetchData();
      } catch (fetchErr) {
        console.warn('[App] Auto-fetch failed after connection:', fetchErr);
      }
    }
  }, [connectDevice, showToast, emitDeviceConnected, handleFetchData]);


  // ── Scan: triggers direct scan and connection fallback ────────────────────
  const handleScan = useCallback(async () => {
    if (isNativePlatform) {
      setIsScanModalOpen(true);
      await startScanning();
    } else {
      const dev = await startScanning();
      if (dev) {
        await handleConnectDevice(dev);
      }
    }
  }, [startScanning, handleConnectDevice]);


  // ── Scan BLE: triggers Web Bluetooth LE scan and connection fallback ──────
  const handleScanBLE = useCallback(async () => {
    const dev = await startScanningBLE();
    if (dev) {
      await handleConnectDevice(dev);
    }
  }, [startScanningBLE, handleConnectDevice]);


  // ── Disconnect — stays on Dashboard ─────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    const name = btConnected ? btDeviceInfo.name : deviceInfo.name;

    if (btConnected) {
      await disconnect();
    }

    setLocalDeviceData(null);

    // Do NOT clear showDashboard — user stays on the dashboard
    // Do NOT clear localStorage — we keep it for Reconnect

    if (name) {
      showToast(`Disconnected from ${name}`, 'warning');
      emitDeviceDisconnected({ deviceName: name });
      try { await deviceApi.disconnect(name); } catch { }
    }
  }, [btConnected, disconnect, emitDeviceDisconnected, btDeviceInfo, deviceInfo, showToast]);


  // ── Reconnect — manual reconnect triggered from Dashboard ────────────────
  const handleReconnect = useCallback(async () => {
    showToast('Attempting to reconnect...', 'info');
    const result = await reconnect();

    if (result) {
      showToast(`Reconnected to ${result.name}!`, 'success');
      setPairTime(new Date());
      try {
        await deviceApi.connect({ deviceName: result.name, deviceId: result.id });
        emitDeviceConnected({ deviceName: result.name, deviceId: result.id });

        // Automatically fetch data after reconnect
        await handleFetchData();
      } catch (err) {
        console.warn('[App] Reconnect logic error:', err);
      }
    } else {
      // reconnect() already set the error state; caller can open scan panel
      showToast('Could not reconnect. Opening scan view...', 'warning');
      await handleScan();
    }
    // Returns null if device unavailable — Dashboard will open scan panel
    return result;
  }, [reconnect, showToast, emitDeviceConnected, handleFetchData, handleScan]);


  // ── Exit — disconnect + return to Home ───────────────────────────────────
  const handleExit = useCallback(async () => {
    if (btConnected) {
      const name = btDeviceInfo.name;
      await disconnect();
      if (name) {
        emitDeviceDisconnected({ deviceName: name });
        try { await deviceApi.disconnect(name); } catch { }
      }
    }
    // Clear persisted device so auto-reconnect doesn't fire on next load
    localStorage.removeItem('lastConnectedDevice');
    setShowDashboard(false);
    setPairTime(null);
    setFetchDataResult(null);
    setFetchDataError(null);
    setLocalDeviceData(null);
  }, [btConnected, disconnect, emitDeviceDisconnected, btDeviceInfo]);


  useEffect(() => {
    setInitialized(true);
  }, []);

  if (!initialized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  // ── Force update: block the entire app ──────────────────────────────────
  if (updateInfo?.forceUpdate) {
    return (
      <UpdateModal
        updateInfo={updateInfo}
        isDownloading={isDownloading}
        isInstalling={isInstalling}
        downloadProgress={downloadProgress}
        error={updateError}
        onUpdate={triggerUpdate}
        onDismiss={null}
      />
    );
  }

  if (isCloudDataView) {
    return (
      <>
        { }
        <div className="bg-grid" aria-hidden="true" />
        <div className="bg-glow bg-glow-1" aria-hidden="true" />
        <div className="bg-glow bg-glow-2" aria-hidden="true" />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <CloudDataView
            lastCreated={lastCreated}
            lastUpdated={lastUpdatedEvent}
            lastDeleted={lastDeleted}
            lastAllDeleted={lastAllDeleted}
          />
        </div>
      </>
    );
  }

  // Toast renderer (shared between both views)
  const ToastLayer = (
    <div className="toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className={`status-dot ${t.type === 'success' ? 'connected' : t.type === 'error' ? 'disconnected' : ''}`}
            style={{ flexShrink: 0 }} />
          <span className="text-sm">{t.message}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      { }
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow bg-glow-1" aria-hidden="true" />
      <div className="bg-glow bg-glow-2" aria-hidden="true" />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header
          deviceInfo={showDashboard ? deviceInfo : { name: null, id: null }}
          isConnected={btConnected}
          isPhysicalConnected={btConnected}
          isSocketConnected={isSocketConnected}
          lastUpdated={lastUpdated}
        />

        {!showDashboard ? (
          <ConnectionScreen
            onConnectDevice={handleConnectDevice}
            onScan={handleScan}
            onClearDevices={clearDiscoveredDevices}
            discoveredDevices={discoveredDevices}
            connectionStatus={connectionStatus}
            isBluetoothSupported={isBluetoothSupported}
            isBluetoothPoweredOn={isBluetoothPoweredOn}
            error={btError}
            showToast={showToast}
          />
        ) : (
          <Dashboard
            deviceData={deviceData || localDeviceData}
            lastUpdatedEvent={lastUpdatedEvent}
            lastDeletedEvent={lastDeleted}
            lastAllDeletedEvent={lastAllDeleted}
            deviceInfo={deviceInfo}
            isConnected={btConnected}
            isPhysicalConnected={btConnected}
            connectionStatus={connectionStatus}
            discoveredDevices={discoveredDevices}
            isScanning={isScanning}
            isConnecting={isConnecting}
            isReconnecting={isReconnecting}
            isFetchingData={isFetchingData}
            fetchDataResult={fetchDataResult}
            fetchDataError={fetchDataError}
            btError={btError}
            isBluetoothPoweredOn={isBluetoothPoweredOn}
            isBluetoothSupported={isBluetoothSupported}
            onFetchData={handleFetchData}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            onExit={handleExit}
            onScan={handleScan}
            onConnectDevice={handleConnectDevice}
            pairTime={pairTime}
            location={location}
            locationError={locationError}
            locationLoading={locationLoading}
            serialLog={serialLog}
            onClearSerialLog={clearSerialLog}
            onSendCommand={sendCommand}
          />
        )}
      </div>

      {ToastLayer}

      {/* ── OTA update modal (non-force — floats over app content) ── */}
      {updateInfo && !updateInfo.forceUpdate && (
        <UpdateModal
          updateInfo={updateInfo}
          isDownloading={isDownloading}
          isInstalling={isInstalling}
          downloadProgress={downloadProgress}
          error={updateError}
          onUpdate={triggerUpdate}
          onDismiss={dismissUpdate}
        />
      )}

      {/* ── Bluetooth Scan Modal ── */}
      <BluetoothScanModal
        isOpen={isScanModalOpen}
        onClose={() => {
          setIsScanModalOpen(false);
          stopScanning();
        }}
        discoveredDevices={discoveredDevices}
        isScanning={isScanning}
        onConnectDevice={handleConnectDevice}
        connectionStatus={connectionStatus}
      />
    </>
  );
}
