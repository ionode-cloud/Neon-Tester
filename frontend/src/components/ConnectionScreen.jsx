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
            <p className="text-sm">Bluetooth Classic is only supported on Android. Use the Android app to connect.</p>
          </div>
        )}

        <div className="conn-iconWrap" style={{ width: '80px', height: '80px', marginBottom: '1rem' }}>
          <RiBluetoothLine className="conn-btIcon" style={{ fontSize: '2.2rem' }} />
          {connectionStatus === 'scanning' && <div className="conn-scanRing" />}
        </div>

        <h2 className="conn-heading font-display" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
          {connectionStatus === 'off' ? 'Bluetooth OFF' :
            connectionStatus === 'scanning' ? 'Scanning for Devices…' :
              connectionStatus === 'connecting' ? 'Connecting to Device…' : 'Bluetooth Monitoring'}
        </h2>
        <p className="conn-description" style={{ fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '480px' }}>
          {connectionStatus === 'off'
            ? 'Enable your system Bluetooth adapter and click Scan to begin.'
            : connectionStatus === 'scanning'
              ? 'Loading paired Bluetooth Classic devices…'
              : 'Click Scan Devices to load your paired HC-05, HC-06, or ESP32 SPP devices.'}
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
            aria-label="Scan for Bluetooth Classic devices"
          >
            {connectionStatus === 'scanning' ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginRight: '4px' }} />
                Scanning…
              </>
            ) : (
              <>
                <RiBluetoothFill style={{ fontSize: '1.1rem' }} />
                Scan Devices
              </>
            )}
          </button>
        )}

        {/* ── Discovered / Paired Device List ─────────────────────────────── */}
        {discoveredDevices && discoveredDevices.length > 0 && (
          <div style={{ width: '100%', maxWidth: '500px', marginTop: '1.5rem' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '0.75rem'
            }}>
              <span className="text-sm" style={{ color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Bluetooth Devices ({discoveredDevices.length})
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={onClearDevices}
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
              >
                Clear
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {discoveredDevices.map(dev => (
                <div
                  key={dev.id}
                  className="glass"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem', borderRadius: '0.75rem',
                    border: '1px solid rgba(0,229,255,0.15)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <RiBluetoothFill style={{ fontSize: '1.1rem', color: 'var(--neon-cyan)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                        {dev.name}
                      </div>
                      <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {dev.address || dev.id}
                      </div>
                    </div>
                  </div>
                  <button
                    id={`btn-connect-${(dev.address || dev.id).replace(/:/g, '-')}`}
                    className="btn btn-primary btn-sm"
                    onClick={() => onConnectDevice(dev)}
                    disabled={connectionStatus === 'connecting'}
                    style={{ flexShrink: 0, marginLeft: '0.5rem' }}
                  >
                    {connectionStatus === 'connecting' ? (
                      <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                    ) : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
