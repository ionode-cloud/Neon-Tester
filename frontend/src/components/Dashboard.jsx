import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  RiDashboard3Line, RiDatabase2Line, RiBluetoothLine, RiBluetoothFill,
  RiCompassLine, RiRulerLine, RiFlashlightLine, RiBatteryFill,
  RiWifiLine, RiRefreshLine, RiLogoutBoxLine, RiDownloadLine,
  RiSignalWifi3Line, RiCheckLine, RiCloseLine,
  RiErrorWarningLine, RiTerminalBoxLine, RiSendPlaneLine, RiDeleteBinLine
} from 'react-icons/ri';
import { deviceApi } from '../services/api';
import StatusCard from './StatusCard';
import BatteryBar from './BatteryBar';
import LocationCard from './LocationCard';

const MAX_HISTORY = 60;

// ─── IST date helper ─────────────────────────────────────────────────────────
const getISTDate = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000);

// ─── Voltage Active check ─────────────────────────────────────────────────────
// 'false', '0', 'inactive', etc. must return false even though they are non-empty strings
const isVoltageActive = (status) => {
  if (status === null || status === undefined || status === '') return false;
  const s = String(status).toLowerCase().trim();
  return s === 'true' || s === 'active' || s === 'normal' || s === '1' || s === 'ok' || s === 'on';
};


// ─── Signal strength bars helper ──────────────────────────────────────────
function RssiBars({ rssi }) {
  const level = rssi >= -60 ? 'rssi-strong' : rssi >= -70 ? 'rssi-medium' : rssi >= -80 ? 'rssi-weak' : 'rssi-poor';
  return (
    <div className={`rssi-bars ${level}`}>
      <div className="rssi-bar" />
      <div className="rssi-bar" />
      <div className="rssi-bar" />
      <div className="rssi-bar" />
    </div>
  );
}

// ─── Connection status badge
function BtStatusBadge({ status }) {
  const cfg = {
    connected: { label: 'Connected', cls: 'bt-badge-connected', dot: 'connected' },
    connecting: { label: 'Connecting…', cls: 'bt-badge-connecting', dot: 'pulsing' },
    reconnecting: { label: 'Reconnecting…', cls: 'bt-badge-connecting', dot: 'pulsing' },
    fetching: { label: 'Fetching Data', cls: 'bt-badge-fetching', dot: 'pulsing' },
    scanning: { label: 'Scanning…', cls: 'bt-badge-connecting', dot: 'pulsing' },
    disconnected: { label: 'Disconnected', cls: 'bt-badge-disconnected', dot: 'disconnected' },
    off: { label: 'BT Off', cls: 'bt-badge-disconnected', dot: 'disconnected' },
    unsupported: { label: 'Unsupported', cls: 'bt-badge-disconnected', dot: 'disconnected' },
  }[status] ?? { label: status, cls: 'bt-badge-disconnected', dot: 'disconnected' };

  return (
    <span className={`bt-status-badge ${cfg.cls}`}>
      <span className={`status-dot ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default function Dashboard({
  deviceData,
  lastUpdatedEvent,
  lastDeletedEvent,
  lastAllDeletedEvent,
  deviceInfo,
  isConnected,
  isPhysicalConnected,
  connectionStatus,
  discoveredDevices,
  isScanning,
  isConnecting,
  isReconnecting,
  isFetchingData,
  fetchDataResult,
  fetchDataError,
  btError,
  isBluetoothPoweredOn,
  isBluetoothSupported,
  onFetchData,
  onConnect,
  onDisconnect,
  onReconnect,
  onExit,
  onScan,
  onConnectDevice,
  pairTime,
  location,
  locationError,
  locationLoading,
  serialLog = [],
  onClearSerialLog,
  onSendCommand,
}) {
  const [history, setHistory] = useState([]);
  const [flashKey, setFlashKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showFetchResult, setShowFetchResult] = useState(false);
  const prevDataRef = useRef(null);
  const prevUpdatedRef = useRef(null);
  const prevDeletedRef = useRef(null);
  const prevAllDeletedRef = useRef(null);

  // Auto-show fetch result when new data arrives
  useEffect(() => {
    if (fetchDataResult || fetchDataError) {
      setShowFetchResult(true);
    }
  }, [fetchDataResult, fetchDataError]);



  useEffect(() => {
    const fetchLatest = () => {
      deviceApi.getData()
        .then((res) => {
          if (res?.latest) {
            setLastUpdated(res.latest.timestamp || new Date());
            setHistory(prev => {
              const last = prev[prev.length - 1];
              if (last && last.timestamp === res.latest.timestamp) return prev;
              const updated = [...prev, res.latest];
              return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
            });
          }
        })
        .catch(() => { });
    };

    fetchLatest();
    const interval = setInterval(fetchLatest, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!deviceData) return;
    if (
      prevDataRef.current &&
      prevDataRef.current._receivedAt === deviceData._receivedAt
    ) return;

    prevDataRef.current = deviceData;
    setFlashKey(k => k + 1);
    setLastUpdated(deviceData.timestamp || new Date());

    setHistory(prev => {
      const updated = [...prev, deviceData];
      return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
    });
  }, [deviceData]);

  useEffect(() => {
    if (!lastUpdatedEvent) return;
    if (
      prevUpdatedRef.current &&
      prevUpdatedRef.current._receivedAt === lastUpdatedEvent._receivedAt
    ) return;

    prevUpdatedRef.current = lastUpdatedEvent;
    setFlashKey(k => k + 1);
    setLastUpdated(new Date());

    setHistory(prev => {
      return prev.map(item => {
        const itemId = item._id || item.id;
        const updatedId = lastUpdatedEvent._id || lastUpdatedEvent.id;
        if (itemId && updatedId && itemId === updatedId) {
          return lastUpdatedEvent;
        }
        return item;
      });
    });
  }, [lastUpdatedEvent]);

  useEffect(() => {
    if (!lastDeletedEvent) return;
    if (
      prevDeletedRef.current &&
      prevDeletedRef.current._receivedAt === lastDeletedEvent._receivedAt
    ) return;

    prevDeletedRef.current = lastDeletedEvent;
    setFlashKey(k => k + 1);
    setLastUpdated(new Date());

    setHistory(prev => {
      return prev.filter(item => {
        const itemId = item._id || item.id;
        const deletedId = lastDeletedEvent.id || lastDeletedEvent._id;

        if (itemId && deletedId && itemId === deletedId) {
          return false;
        }

        if (lastDeletedEvent.deviceId && item.deviceId === lastDeletedEvent.deviceId) {
          return false;
        }

        return true;
      });
    });
  }, [lastDeletedEvent]);

  useEffect(() => {
    if (!lastAllDeletedEvent) return;
    if (
      prevAllDeletedRef.current &&
      prevAllDeletedRef.current === lastAllDeletedEvent
    ) return;

    prevAllDeletedRef.current = lastAllDeletedEvent;
    setHistory([]);
    setFlashKey(k => k + 1);
    setLastUpdated(new Date());
  }, [lastAllDeletedEvent]);

  const current = deviceData || history[history.length - 1] || null;

  const formatTime = (ts) => {
    if (!ts) return '--';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZone: 'UTC',
    }).format(new Date(ts));
  };

  const stats = useMemo(() => {
    if (!history.length) return null;
    const tilts = history.map(h => h.tiltAngle).filter((v) => v !== undefined && v !== null);
    const heights = history.map(h => h.height).filter((v) => v !== undefined && v !== null);
    const batts = history.map(h => h.batterySOC).filter((v) => v !== undefined && v !== null);
    const activeVoltage = history.filter(h => isVoltageActive(h.voltageStatus)).length;
    return {
      avgTilt: tilts.reduce((a, b) => a + b, 0) / tilts.length || 0,
      maxTilt: Math.max(...tilts, 0),
      avgHeight: heights.reduce((a, b) => a + b, 0) / heights.length || 0,
      minBattery: Math.min(...batts, 100),
      voltageUptime: history.length ? (activeVoltage / history.length * 100).toFixed(0) : 0,
    };
  }, [history]);

  const isBusy = isConnecting || isReconnecting || isFetchingData || isScanning;

  return (
    <main className="dash-wrapper">

      {/* ── Top Bar──────── */}
      <div className="dash-topBar">
        <div className="dash-topLeft">
          <RiDashboard3Line className="dash-topIcon" />
          <div>
            <h2 className="dash-pageTitle font-display">Live Dashboard</h2>
            <p className="text-xs text-muted">
              Last update: <span className="font-mono text-cyan">{formatTime(lastUpdated)}</span>
            </p>
          </div>
        </div>

        <div className="dash-topRight">

          {/* Cloud Data */}
          <button
            id="btn-cloud-data"
            className="btn btn-ghost btn-sm"
            style={{
              border: '1px solid rgba(0, 229, 255, 0.3)',
              color: 'var(--neon-cyan)',
              background: 'rgba(0, 229, 255, 0.05)',
            }}
            onClick={() => window.open(window.location.origin + '?view=clouddata', '_blank')}
            title="Open database history in another tab"
          >
            <RiDatabase2Line />
            <span className="btn-label">Cloud Data</span>
          </button>

          {/* Fetch Data */}
          <button
            id="btn-fetch-data"
            className="btn btn-success btn-sm"
            onClick={onFetchData}
            disabled={!isConnected || isBusy}
            title={!isConnected ? 'Connect to a device first' : 'Fetch data from HC-05'}
          >
            {isFetchingData ? (
              <>
                <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                <span className="btn-label">Fetching…</span>
              </>
            ) : (
              <>
                <RiDownloadLine />
                <span className="btn-label">Fetch Data</span>
              </>
            )}
          </button>

          {/* Disconnect (only when physically connected) */}
          {isConnected && (
            <button
              id="btn-disconnect"
              className="btn btn-danger btn-sm"
              onClick={onDisconnect}
              disabled={isBusy}
              title="Disconnect Bluetooth device"
            >
              <RiBluetoothLine />
              <span className="btn-label">Disconnect</span>
            </button>
          )}

          {/* Reconnect — scans and reconnects to last device */}
          {!isConnected && (
            <button
              id="btn-reconnect"
              className="btn btn-warning btn-sm"
              onClick={onReconnect}
              disabled={isBusy || !isBluetoothPoweredOn}
              title="Scan and reconnect"
            >
              {isConnecting || isReconnecting ? (
                <>
                  <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                  <span className="btn-label">Connecting…</span>
                </>
              ) : (
                <>
                  <RiRefreshLine />
                  <span className="btn-label">Reconnect</span>
                </>
              )}
            </button>
          )}

          {/* Exit button — always visible */}
          <button
            id="btn-exit"
            className="btn btn-ghost btn-sm"
            style={{
              border: '1px solid rgba(255, 23, 68, 0.3)',
              color: 'var(--neon-red)',
              background: 'rgba(255, 23, 68, 0.05)',
            }}
            onClick={onExit}
            title="Disconnect and return to Home"
          >
            <RiLogoutBoxLine />
            <span className="btn-label">Exit</span>
          </button>
        </div>
      </div>

      {/* ── BT Error banner */}
      {btError && (
        <div className="bt-error-banner animate-fadeIn">
          <RiErrorWarningLine style={{ fontSize: '1.1rem', flexShrink: 0 }} />
          <span className="text-sm">{btError}</span>
        </div>
      )}

      {/* ── Bluetooth OFF banner  */}
      {!isBluetoothPoweredOn && isBluetoothSupported && (
        <div className="warn-banner animate-fadeIn">
          <RiSignalWifi3Line style={{ fontSize: '1.25rem', flexShrink: 0 }} />
          <div>
            <strong style={{ display: 'block' }}>Bluetooth is OFF</strong>
            <span className="text-xs">Please enable Bluetooth to scan or reconnect.</span>
          </div>
        </div>
      )}

      {/* ── Fetch Data Result Box ──────────────────────────────────────── */}
      {showFetchResult && (fetchDataResult || fetchDataError) && (
        <div className={`fetch-result-box animate-fadeInUp ${fetchDataError ? 'fetch-result-error' : 'fetch-result-success'}`}>
          <div className="fetch-result-header">
            <div className="fetch-result-title">
              {fetchDataError
                ? <><RiErrorWarningLine /> Fetch Failed</>
                : <><RiCheckLine /> Data Received from HC-05</>
              }
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '0.2rem 0.4rem', minWidth: 'unset' }}
              onClick={() => setShowFetchResult(false)}
              title="Dismiss"
            >
              <RiCloseLine />
            </button>
          </div>
          <div className="fetch-result-body font-mono">
            {fetchDataError ? (
              <span style={{ color: 'var(--neon-red)' }}>{fetchDataError}</span>
            ) : fetchDataResult?._raw ? (
              // Unrecognized format — show raw string
              <>
                <div style={{ color: 'var(--neon-yellow)', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                  ⚠ Unrecognized data format — showing raw response:
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {fetchDataResult._raw}
                </pre>
              </>
            ) : fetchDataResult ? (
              // Structured display of parsed HC-05 fields
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>🔵 Tilt Angle</span>
                  <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>
                    {fetchDataResult.tiltAngle !== undefined ? `${parseFloat(fetchDataResult.tiltAngle).toFixed(1)}°` : '--'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>📏 Height</span>
                  <span style={{ color: '#a78bfa', fontWeight: 600 }}>
                    {fetchDataResult.height !== undefined ? `${parseFloat(fetchDataResult.height).toFixed(2)} m` : '--'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>⚡ Voltage</span>
                  <span style={{ color: isVoltageActive(fetchDataResult.voltageStatus) ? 'var(--neon-green)' : 'var(--neon-red)', fontWeight: 600 }}>
                    {fetchDataResult.voltageStatus !== undefined ? (isVoltageActive(fetchDataResult.voltageStatus) ? 'Active' : 'Inactive') : '--'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>🔋 Battery SOC</span>
                  <span style={{
                    color: fetchDataResult.batterySOC >= 60 ? 'var(--neon-green)' : fetchDataResult.batterySOC >= 30 ? 'var(--neon-yellow)' : 'var(--neon-red)',
                    fontWeight: 600
                  }}>
                    {fetchDataResult.batterySOC !== undefined ? `${parseFloat(fetchDataResult.batterySOC).toFixed(1)}%` : '--'}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── KPI Cards───── */}
      <div className="grid grid-4 dash-kpiGrid">
        <StatusCard
          key={`tilt-${flashKey}`}
          icon={<RiCompassLine />}
          label="Tilt Angle"
          value={current?.tiltAngle?.toFixed(1) ?? '--'}
          unit="°"
          color="cyan"
          subLabel={stats ? `Max: ${stats.maxTilt.toFixed(1)}°` : undefined}
          highlight={flashKey > 0}
          className="animate-fadeInUp stagger-1"
        />

        <StatusCard
          key={`height-${flashKey}`}
          icon={<RiRulerLine />}
          label="Height"
          value={current?.height?.toFixed(2) ?? '--'}
          unit=" m"
          color="purple"
          subLabel={stats ? `Avg: ${stats.avgHeight.toFixed(2)} m` : undefined}
          highlight={flashKey > 0}
          className="animate-fadeInUp stagger-2"
        />

        <StatusCard
          icon={<RiFlashlightLine />}
          label="Voltage Status"
          value={current?.voltageStatus !== undefined && current?.voltageStatus !== null
            ? (isVoltageActive(current.voltageStatus) ? 'Active' : 'Inactive')
            : '--'}
          unit=""
          color={isVoltageActive(current?.voltageStatus) ? 'green' : 'red'}
          subLabel={stats ? `Uptime: ${stats.voltageUptime}%` : undefined}
          className="animate-fadeInUp stagger-3"
        />

        <StatusCard
          key={`batt-${flashKey}`}
          icon={<RiBatteryFill />}
          label="Battery SOC"
          value={current?.batterySOC?.toFixed(1) ?? '--'}
          unit="%"
          color={
            (current?.batterySOC ?? 100) >= 60 ? 'green' :
              (current?.batterySOC ?? 100) >= 30 ? 'yellow' : 'red'
          }
          subLabel={stats ? `Min: ${stats.minBattery.toFixed(1)}%` : undefined}
          highlight={flashKey > 0}
          className="animate-fadeInUp stagger-4"
        >
          <BatteryBar value={current?.batterySOC ?? 0} />
        </StatusCard>

        <LocationCard
          location={location}
          error={locationError}
          loading={locationLoading}
          pairTime={pairTime}
          onClick={() => {
            if (location) {
              window.open(
                `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`,
                '_blank',
                'noopener,noreferrer'
              );
            }
          }}
        />
      </div>

    </main>
  );
}
