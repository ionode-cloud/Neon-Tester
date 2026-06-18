import React from 'react';
import { RiBluetoothLine, RiBluetoothFill, RiCloseLine } from 'react-icons/ri';

export default function BluetoothScanModal({
  isOpen,
  onClose,
  discoveredDevices,
  isScanning,
  onConnectDevice,
  connectionStatus,
}) {
  if (!isOpen) return null;

  return (
    <div className="update-modal-backdrop" style={{ zIndex: 10000 }}>
      <div className="update-modal-card animate-fadeInUp" style={{ maxWidth: '450px', padding: '1.5rem' }}>
        <div className="update-modal-corner" style={{ opacity: 0.15 }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            {isScanning ? 'Scanning for classical devices...' : 'Found Devices'}
          </h2>
          {isScanning && <div className="spinner" style={{ width: '18px', height: '18px' }} />}
        </div>

        <div style={{
          maxHeight: '400px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          paddingRight: '0.5rem'
        }}>
          {discoveredDevices.length === 0 && !isScanning && (
            <div className="dash-scan-empty">No devices found.</div>
          )}

          {discoveredDevices.map((dev) => (
            <button
              key={dev.id}
              className="device-card"
              onClick={() => onConnectDevice(dev)}
              disabled={connectionStatus === 'connecting'}
              style={{ width: '100%', padding: '0.875rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <RiBluetoothFill style={{
                  color: dev.isPaired ? 'var(--neon-cyan)' : 'var(--text-muted)',
                  fontSize: '1.2rem'
                }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    [{dev.address}] {dev.name || 'Unknown'}
                  </div>
                  {dev.isPaired && (
                    <span className="text-xs" style={{ color: 'var(--neon-cyan)', opacity: 0.8 }}>Paired</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
