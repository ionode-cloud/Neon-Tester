import React from 'react';
import { RiBluetoothFill } from 'react-icons/ri';

export default function Header({ deviceInfo, isConnected, isPhysicalConnected, isSocketConnected, lastUpdated }) {
  const formatTime = (date) => {
    if (!date) return '--';
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(new Date(date));
  };

  return (
    <header className="header-wrapper">
      <div className="header-left">
        <div className="header-logo">
          <div className="header-logoIcon">
            <RiBluetoothFill />
          </div>
          <div>
            <h1 className="header-title font-display">NEON TESTER</h1>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {deviceInfo?.name && deviceInfo.name !== 'Simulated Device' && (
          <div className="header-deviceChip">
            <div className={`status-dot ${isPhysicalConnected ? 'connected' : 'disconnected'}`} />
            <span className="font-mono text-sm">{deviceInfo.name}</span>

            {deviceInfo.id && (
              <span className="text-xs text-muted header-deviceId">· {deviceInfo.id.slice(0, 8)}…</span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
