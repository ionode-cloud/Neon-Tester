import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';

import useBluetooth from './hooks/useBluetooth';
import useSocket from './hooks/useSocket';
import useLocation from './hooks/useLocation';
import { deviceApi } from './services/api';

import Header from './components/Header';
import ConnectionScreen from './components/ConnectionScreen';
import Dashboard from './components/Dashboard';
import CloudDataView from './components/CloudDataView';


export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [isCloudDataView, setIsCloudDataView] = useState(false);
  const [pairTime, setPairTime] = useState(null);
  const [wasConnected, setWasConnected] = useState(() => {
    return !!localStorage.getItem('lastConnectedDevice');
  });





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

  const handleBluetoothData = useCallback(
    (data) => {
      const currentLoc = latestLocationRef.current;
      const dataWithLoc = {
        ...data,
        latitude: currentLoc ? currentLoc.lat : null,
        longitude: currentLoc ? currentLoc.lng : null,
      };
      emitBluetoothData(dataWithLoc);
    },
    [emitBluetoothData]
  );

  const {
    connect,
    connectDevice,
    disconnect,
    startScanning,
    clearDiscoveredDevices,
    isConnected: btConnected,
    isScanning,
    isConnecting,
    isReconnecting,
    deviceInfo: btDeviceInfo,
    error: btError,
    discoveredDevices,
    isBluetoothPoweredOn,
    connectionStatus,
    isBluetoothSupported,
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
      setWasConnected(true);
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


  const isConnected = btConnected || wasConnected;
  const { location, error: locationError, loading: locationLoading } = useLocation({ enabled: isConnected });
  latestLocationRef.current = location;

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

  const lastUpdated = deviceData?.timestamp ?? deviceData?._receivedAt;


  const handleScan = useCallback(async () => {
    showToast('Opening BLE device picker — select a device to add it to the list.', 'info');
    await startScanning();
  }, [startScanning, showToast]);


  const handleConnect = useCallback(async () => {
    showToast('Opening native BLE chooser dialog...', 'info');
    const result = await connect();

    if (result) {
      showToast(`Connected to ${result.name}!`, 'success');
      setPairTime(new Date());
      await deviceApi.connect({ deviceName: result.name, deviceId: result.id });
      emitDeviceConnected({ deviceName: result.name, deviceId: result.id });
    }
  }, [connect, emitDeviceConnected, showToast]);


  const handleConnectDevice = useCallback(async (dev) => {
    showToast(`Connecting to ${dev.name}...`, 'info');
    const result = await connectDevice(dev);

    if (result) {
      showToast(`Connected to ${dev.name}!`, 'success');
      setPairTime(new Date());
      await deviceApi.connect({ deviceName: result.name, deviceId: result.id });
      emitDeviceConnected({ deviceName: result.name, deviceId: result.id });
    }
  }, [connectDevice, showToast, emitDeviceConnected]);


  const handleDisconnect = useCallback(async () => {
    localStorage.removeItem('lastConnectedDevice');
    setWasConnected(false);
    setPairTime(null);

    const name = btConnected ? btDeviceInfo.name : deviceInfo.name;
    if (btConnected) {
      await disconnect();
    }

    if (name) {
      showToast(`Disconnected from ${name}`, 'warning');
      emitDeviceDisconnected({ deviceName: name });
      await deviceApi.disconnect(name);
    }
  }, [btConnected, disconnect, emitDeviceDisconnected, btDeviceInfo, deviceInfo, showToast]);


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

  if (isCloudDataView) {
    return (
      <>
        {}
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

  return (
    <>
      {}
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow bg-glow-1" aria-hidden="true" />
      <div className="bg-glow bg-glow-2" aria-hidden="true" />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header
          deviceInfo={deviceInfo}
          isConnected={isConnected}
          isPhysicalConnected={btConnected}
          isSocketConnected={isSocketConnected}
          lastUpdated={lastUpdated}
        />

        {!isConnected ? (
          <ConnectionScreen
            onConnect={handleConnect}
            onConnectDevice={handleConnectDevice}
            onScan={handleConnect}
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
            deviceData={deviceData}
            lastUpdatedEvent={lastUpdatedEvent}
            lastDeletedEvent={lastDeleted}
            lastAllDeletedEvent={lastAllDeleted}
            deviceInfo={deviceInfo}
            isConnected={isConnected}
            isPhysicalConnected={btConnected}
            onDisconnect={handleDisconnect}
            onReconnect={handleConnect}
            pairTime={pairTime}
            location={location}
            locationError={locationError}
            locationLoading={locationLoading}
          />
        )}
      </div>
    </>
  );
}
