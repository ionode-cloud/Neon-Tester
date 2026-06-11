import React from 'react';
import { RiSignalWifiErrorLine, RiBluetoothLine, RiBluetoothFill } from 'react-icons/ri';

export default function ConnectionScreen({
  onConnect,
  onConnectDevice,
  onScan,
  onClearDevices,
  discoveredDevices,
  connectionStatus,
  isBluetoothSupported,
  isBluetoothPoweredOn,
  error,
}) {
  return (
    <main className="conn-screen" style={{ flexDirection: 'column', gap: '2rem', padding: '3rem 2rem' }}>
      <div className="conn-rings">
        <div className="conn-ring conn-ring1" />
        <div className="conn-ring conn-ring2" />
        <div className="conn-ring conn-ring3" />
      </div>

      <div className="conn-content animate-fadeInUp" style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {!isBluetoothPoweredOn && isBluetoothSupported && (
          <div className="warn-banner" style={{ marginBottom: '2rem', width: '100%', maxWidth: '500px' }}>
            <RiSignalWifiErrorLine style={{ fontSize: '1.5rem' }} />
            <div style={{ textAlign: 'left' }}>
              <strong style={{ display: 'block' }}>Bluetooth is OFF</strong>
              <span className="text-xs">Please turn on Bluetooth to scan devices</span>
            </div>
          </div>
        )}

        {!isBluetoothSupported && (
          <div className="conn-errorBox" style={{ marginBottom: '2rem', width: '100%', maxWidth: '500px' }}>
            <RiSignalWifiErrorLine style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }} />
            <p className="text-sm">Web Bluetooth is not supported. Use Chrome or Edge on desktop.</p>
          </div>
        )}

        <div className="conn-iconWrap" style={{ width: '80px', height: '80px', marginBottom: '1rem' }}>
          <RiBluetoothLine className="conn-btIcon" style={{ fontSize: '2.2rem' }} />
          {connectionStatus === 'scanning' && <div className="conn-scanRing" />}
        </div>

        <h2 className="conn-heading font-display" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
          {connectionStatus === 'off' ? 'Bluetooth OFF' :
            connectionStatus === 'scanning' ? 'Opening Device Picker…' :
              connectionStatus === 'connecting' ? 'Connecting to Device…' : 'Bluetooth Monitoring'}
        </h2>
        <p className="conn-description" style={{ fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '480px' }}>
          {connectionStatus === 'off'
            ? 'Enable your system Bluetooth adapter and click scan to begin.'
            : connectionStatus === 'scanning'
              ? 'Select a device from the browser dialog to pair and connect.'
              : 'Click Scan & Connect Device to open the BLE picker.'}
        </p>

        {error && (
          <div className="conn-errorBox" style={{ marginBottom: '1.5rem', width: '100%', maxWidth: '500px' }}>
            <span className="text-sm">{error}</span>
          </div>
        )}

        {isBluetoothSupported && connectionStatus !== 'connecting' && (
          <button
            id="btn-scan-bluetooth"
            className="btn btn-primary btn-md conn-connectBtn"
            onClick={onScan}
            disabled={connectionStatus === 'scanning'}
            aria-label="Scan for BLE devices"
          >
            {connectionStatus === 'scanning' ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginRight: '4px' }} />
                Opening BLE Picker…
              </>
            ) : (
              <>
                <RiBluetoothFill style={{ fontSize: '1.1rem' }} />
                Scan & Connect Device
              </>
            )}
          </button>
        )}
      </div>
    </main>
  );
}
