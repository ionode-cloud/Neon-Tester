import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  RiBluetoothFill, RiBluetoothLine, RiDatabase2Line,
  RiSignalWifiErrorLine, RiCompassLine, RiRulerLine, RiFlashlightLine,
  RiBatteryFill, RiDashboard3Line, RiBatteryLowFill, RiBatteryChargeLine
} from 'react-icons/ri';


import useBluetooth from './hooks/useBluetooth';
import useSocket from './hooks/useSocket';
import { deviceApi } from './services/api';

// ─── BatteryBar Component ─────────────────────────────────────────────────────
function BatteryBar({ value = 0 }) {
  const clamped = Math.max(0, Math.min(100, value));

  const getColor = () => {
    if (clamped >= 60) return 'green';
    if (clamped >= 30) return 'yellow';
    return 'red';
  };

  const getIcon = () => {
    if (clamped <= 20) return <RiBatteryLowFill />;
    if (clamped >= 80) return <RiBatteryFill />;
    return <RiBatteryChargeLine />;
  };

  const colorClass = getColor();

  return (
    <div className="batt-wrapper">
      {/* Battery icon */}
      <div className={`batt-icon batt-${colorClass}`}>
        {getIcon()}
      </div>

      {/* Bar track */}
      <div className="batt-track">
        <div
          className={`batt-fill batt-${colorClass}`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Battery: ${clamped}%`}
        >
          {/* Shimmer effect */}
          <div className="batt-shimmer" />
        </div>
      </div>

      {/* Percentage label */}
      <span className={`batt-label batt-${colorClass}`}>
        {clamped.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── StatusCard Component ─────────────────────────────────────────────────────
function StatusCard({
  icon,
  label,
  value,
  unit = '',
  color = 'cyan',
  subLabel,
  highlight,
  children,
  className = '',
}) {
  return (
    <div
      className={`card card-status card-status-${color} ${highlight ? 'card-status-flash' : ''} ${className}`}
      aria-label={`${label}: ${value}${unit}`}
    >
      {/* Corner accent */}
      <div className={`card-cornerAccent card-accent-${color}`} />

      {/* Header row */}
      <div className="card-header">
        <div className={`card-iconBox card-icon-${color}`}>
          {icon}
        </div>
        <div className="card-labelGroup">
          <span className="card-label section-label">{label}</span>
          {subLabel && <span className="card-subLabel">{subLabel}</span>}
        </div>
      </div>

      {/* Value */}
      {value !== undefined && value !== null && (
        <div className="card-valueRow">
          <span className={`card-value font-display card-val-${color}`}>
            {value}
          </span>
          {unit && <span className="card-unit">{unit}</span>}
        </div>
      )}

      {/* Optional children (e.g. BatteryBar) */}
      {children && <div className="card-extra">{children}</div>}
    </div>
  );
}

// ─── Header Component ──
function Header({ deviceInfo, isConnected, isPhysicalConnected, isSocketConnected, lastUpdated }) {
  const formatTime = (date) => {
    if (!date) return '--';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
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
        {isConnected && deviceInfo.name && deviceInfo.name !== 'Simulated Device' && (
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

// ─── Helpers ───────────
const getRssiClass = (rssi) => {
  if (rssi >= -60) return 'rssi-strong';
  if (rssi >= -75) return 'rssi-medium';
  if (rssi >= -85) return 'rssi-weak';
  return 'rssi-poor';
};

// ─── ConnectionScreen Component ───────────────────────────────────────────────
function ConnectionScreen({
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
      {/* Animated rings */}
      <div className="conn-rings">
        <div className="conn-ring conn-ring1" />
        <div className="conn-ring conn-ring2" />
        <div className="conn-ring conn-ring3" />
      </div>

      <div className="conn-content animate-fadeInUp" style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Warning: Bluetooth Off */}
        {!isBluetoothPoweredOn && isBluetoothSupported && (
          <div className="warn-banner" style={{ marginBottom: '2rem', width: '100%', maxWidth: '500px' }}>
            <RiSignalWifiErrorLine style={{ fontSize: '1.5rem' }} />
            <div style={{ textAlign: 'left' }}>
              <strong style={{ display: 'block' }}>Bluetooth is OFF</strong>
              <span className="text-xs">Please turn on Bluetooth to scan devices</span>
            </div>
          </div>
        )}

        {/* Warning: Web Bluetooth Not Supported */}
        {!isBluetoothSupported && (
          <div className="conn-errorBox" style={{ marginBottom: '2rem', width: '100%', maxWidth: '500px' }}>
            <RiSignalWifiErrorLine style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }} />
            <p className="text-sm">Web Bluetooth is not supported. Use Chrome or Edge on desktop.</p>
          </div>
        )}

        {/* Bluetooth icon */}
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

        {/* Error alert */}
        {error && (
          <div className="conn-errorBox" style={{ marginBottom: '1.5rem', width: '100%', maxWidth: '500px' }}>
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Scan Button */}
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


// ─── Dashboard Component ──────────────────────────────────────────────────────
const MAX_HISTORY = 60; // rolling history window for stats

function Dashboard({
  deviceData,
  deviceInfo,
  isConnected,
  isPhysicalConnected,
  onDisconnect,
  onReconnect,
}) {
  const [history, setHistory] = useState([]);
  const [flashKey, setFlashKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const prevDataRef = useRef(null);

  // ── Load initial data from API on mount ──────────────────────────────────────
  useEffect(() => {
    deviceApi.getData()
      .then((res) => {
        if (res?.latest) {
          setHistory([res.latest]);
          setLastUpdated(res.latest.timestamp);
        }
      })
      .catch(() => { });
  }, []);

  // ── Append incoming real-time data point ─────────────────────────────────────
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

  const current = deviceData || history[history.length - 1] || null;

  const formatTime = (ts) => {
    if (!ts) return '--';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(ts));
  };

  // ── Summary stats ────
  const stats = React.useMemo(() => {
    if (!history.length) return null;
    const tilts = history.map(h => h.tiltAngle).filter((v) => v !== undefined && v !== null);
    const heights = history.map(h => h.height).filter((v) => v !== undefined && v !== null);
    const batts = history.map(h => h.batterySOC).filter((v) => v !== undefined && v !== null);
    const activeVoltage = history.filter(h => h.voltageStatus).length;
    return {
      avgTilt: tilts.reduce((a, b) => a + b, 0) / tilts.length || 0,
      maxTilt: Math.max(...tilts, 0),
      avgHeight: heights.reduce((a, b) => a + b, 0) / heights.length || 0,
      minBattery: Math.min(...batts, 100),
      voltageUptime: history.length ? (activeVoltage / history.length * 100).toFixed(0) : 0,
    };
  }, [history]);

  return (
    <main className="dash-wrapper">
      {/* ── Top bar ───── */}
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
            Cloud Data
          </button>

          <button
            id="btn-disconnect"
            className="btn btn-danger btn-sm"
            onClick={onDisconnect}
            title="Disconnect Bluetooth device"
          >
            <RiBluetoothLine />
            Disconnect
          </button>
        </div>
      </div>

      {/* ── KPI Cards ─── */}
      <div className="grid grid-4 dash-kpiGrid">
        {/* Tilt Angle */}
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

        {/* Height */}
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

        {/* Voltage Status */}
        <StatusCard
          icon={<RiFlashlightLine />}
          label="Voltage Status"
          color={current?.voltageStatus ? 'green' : 'red'}
          subLabel={undefined}
          className="animate-fadeInUp stagger-3"
        >
          <div className={`badge ${current?.voltageStatus ? 'badge-active' : 'badge-inactive'}`}
            style={{ fontSize: '0.9rem', padding: '0.4rem 1rem', marginTop: '0.25rem' }}>
            <div className={`status-dot ${current?.voltageStatus ? 'connected' : 'disconnected'}`} />
            {current?.voltageStatus ? 'Active' : 'Inactive'}
          </div>
        </StatusCard>

        {/* Battery SOC */}
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
      </div>
    </main>
  );
}

// ─── CloudDataView Component ──────────────────────────────────────────────────
function CloudDataView() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [limit, setLimit] = useState(15);
  const [filterDeviceId, setFilterDeviceId] = useState('');

  const fetchData = useCallback(() => {
    setLoading(true);
    deviceApi.getHistory({
      page,
      limit,
      deviceId: filterDeviceId || undefined,
    })
      .then((res) => {
        if (res.success) {
          setData(res.data);
          setTotalPages(res.pagination.pages);
          setTotalRecords(res.pagination.total);
          setError(null);
        } else {
          setError(res.error || 'Failed to fetch history data');
        }
      })
      .catch((err) => {
        setError(err.message || 'Error communicating with server');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [page, limit, filterDeviceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      const res = await deviceApi.deleteData({ id });
      if (res.success) {
        fetchData();
      } else {
        alert(res.error || 'Failed to delete record');
      }
    } catch (err) {
      alert(err.message || 'Error deleting record');
    }
  };

  const handleClearAll = async () => {
    if (!filterDeviceId) {
      alert('Please enter a specific Device ID to clear all its records.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ALL records for device "${filterDeviceId}"? This action is permanent.`)) return;
    try {
      const res = await deviceApi.deleteData({ deviceId: filterDeviceId });
      if (res.success) {
        setPage(1);
        fetchData();
      } else {
        alert(res.error || 'Failed to clear records');
      }
    } catch (err) {
      alert(err.message || 'Error clearing records');
    }
  };

  const handleClearAllData = async () => {
    if (!window.confirm('Delete ALL telemetry records from the database? This cannot be undone.')) return;
    try {
      const res = await deviceApi.deleteAll();
      if (res.success) {
        setPage(1);
        fetchData();
      } else {
        alert(res.error || 'Failed to clear all data');
      }
    } catch (err) {
      alert(err.message || 'Error clearing data');
    }
  };

  const handleExportCSV = () => {
    if (!data.length) return;
    const headers = ['Timestamp', 'Device ID', 'Tilt Angle (°)', 'Height (m)', 'Voltage Status', 'Battery SOC (%)'];
    const csvRows = [
      headers.join(','),
      ...data.map((row) => [
        new Date(row.timestamp).toISOString(),
        row.deviceId,
        row.tiltAngle,
        row.height,
        row.voltageStatus ? 'ACTIVE' : 'INACTIVE',
        row.batterySOC,
      ].map(val => `"${val}"`).join(','))
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `cloud_telemetry_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (ts) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(ts));
  };

  return (
    <div className="dash-wrapper" style={{ padding: '2rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Header Bar */}
      <div className="dash-topBar" style={{ marginBottom: '1.5rem' }}>
        <div className="dash-topLeft">
          <RiDatabase2Line className="dash-topIcon" style={{ color: 'var(--neon-cyan)', fontSize: '1.75rem' }} />
          <div>
            <h2 className="dash-pageTitle font-display" style={{ fontSize: '1.375rem' }}>Cloud Telemetry Database</h2>
            <p className="text-xs text-muted">
              Total stored records: <span className="font-mono text-cyan">{totalRecords}</span>
            </p>
          </div>
        </div>

        <div className="dash-topRight" style={{ gap: '1rem' }}>
          <button onClick={handleExportCSV} className="btn btn-ghost btn-sm" disabled={!data.length}>
            Export to CSV
          </button>
          <button onClick={fetchData} className="btn btn-ghost btn-sm">
            Refresh
          </button>
          <button onClick={handleClearAllData} className="btn btn-danger btn-sm" title="Delete all records from the database">
            Clear All Data
          </button>
          <button onClick={() => window.close()} className="btn btn-ghost btn-sm">
            Close Tab
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 200px' }}>
          <label className="section-label" style={{ margin: 0 }}>Filter by Device ID</label>
          <input
            type="text"
            className="font-mono"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.45rem 0.75rem',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'border-color var(--transition-fast)',
            }}
            placeholder="Enter deviceId..."
            value={filterDeviceId}
            onChange={(e) => {
              setFilterDeviceId(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100px' }}>
          <label className="section-label" style={{ margin: 0 }}>Rows</label>
          <select
            style={{
              background: 'rgba(8,13,26,0.9)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.45rem 0.5rem',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
            }}
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
          </select>
        </div>

        {filterDeviceId && (
          <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
            <button onClick={handleClearAll} className="btn btn-danger btn-sm">
              Clear All for "{filterDeviceId}"
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', padding: '2rem' }}>
            <span style={{ color: 'var(--neon-red)', fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</span>
            <p className="text-lg text-primary">{error}</p>
            <button onClick={fetchData} className="btn btn-ghost btn-sm" style={{ marginTop: '1rem' }}>Try Again</button>
          </div>
        ) : !data.length ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', padding: '2rem' }}>
            <p className="text-lg text-muted">No telemetry records found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Timestamp</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Device ID</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'right' }}>Tilt Angle</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'right' }}>Height</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>Voltage</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Battery SOC</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background var(--transition-fast)' }} className="table-row-hover">
                    <td style={{ padding: '0.875rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatTime(row.timestamp)}</td>
                    <td style={{ padding: '0.875rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--neon-cyan)' }}>{row.deviceId}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: '600' }}>{row.tiltAngle.toFixed(1)}°</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#a78bfa' }}>{row.height.toFixed(2)} m</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <span className={`badge ${row.voltageStatus ? 'badge-active' : 'badge-inactive'}`} style={{ fontSize: '0.75rem' }}>
                        {row.voltageStatus ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', width: '220px' }}>
                      <BatteryBar value={row.batterySOC} />
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDelete(row._id)}
                        className="btn btn-danger btn-sm"
                        style={{ padding: '0.35rem 0.6rem', minWidth: 'auto' }}
                        title="Delete record"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && !loading && !error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', marginTop: '1.5rem' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn btn-ghost btn-sm"
          >
            Previous
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Page <strong style={{ color: 'var(--neon-cyan)' }}>{page}</strong> of <strong>{totalPages}</strong>
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn btn-ghost btn-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main App Component 
export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [isCloudDataView, setIsCloudDataView] = useState(false);
  const [wasConnected, setWasConnected] = useState(() => {
    return !!localStorage.getItem('lastConnectedDevice');
  });

  // Mock connection states
  const [mockIntervalId, setMockIntervalId] = useState(null);
  const [isMockConnected, setIsMockConnected] = useState(false);
  const [mockDeviceInfo, setMockDeviceInfo] = useState({ name: null, id: null });

  // Toast notifications state
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

  // ── Socket ───────────
  const {
    deviceData,
    isSocketConnected,
    emitBluetoothData,
    emitDeviceConnected,
    emitDeviceDisconnected,
  } = useSocket();

  // ── Bluetooth ────────
  const handleBluetoothData = useCallback(
    (data) => {
      emitBluetoothData(data); // relay to backend via Socket.IO
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

  // Clean up mock stream interval on unmount
  useEffect(() => {
    return () => {
      if (mockIntervalId) clearInterval(mockIntervalId);
    };
  }, [mockIntervalId]);

  // Disconnect mock hardware if Bluetooth radio is turned OFF
  useEffect(() => {
    if (!isBluetoothPoweredOn && isMockConnected) {
      if (mockIntervalId) clearInterval(mockIntervalId);
      setMockIntervalId(null);
      setIsMockConnected(false);
      setMockDeviceInfo({ name: null, id: null });
      showToast('Bluetooth turned OFF! Disconnected mock hardware.', 'error');
    }
  }, [isBluetoothPoweredOn, isMockConnected, mockIntervalId, showToast]);

  // ── Effective connection state ───────────────────────────────────────────────
  const isConnected = btConnected || isMockConnected || wasConnected;
  const deviceInfo = useMemo(() => {
    if (btConnected) return btDeviceInfo;
    if (isMockConnected) return mockDeviceInfo;
    const lastDeviceStr = localStorage.getItem('lastConnectedDevice');
    if (lastDeviceStr) {
      try {
        return JSON.parse(lastDeviceStr);
      } catch {
        return { name: null, id: null };
      }
    }
    return { name: null, id: null };
  }, [btConnected, isMockConnected, btDeviceInfo, mockDeviceInfo]);

  const lastUpdated = deviceData?.timestamp ?? deviceData?._receivedAt;

  // ── Scan handler — opens browser BLE picker to discover devices ────────────
  const handleScan = useCallback(async () => {
    showToast('Opening BLE device picker — select a device to add it to the list.', 'info');
    await startScanning();
  }, [startScanning, showToast]);

  // ── Connect handler (Legacy Native Chooser dialog) ──────────────────────────
  const handleConnect = useCallback(async () => {
    showToast('Opening native BLE chooser dialog...', 'info');
    const result = await connect();

    if (result) {
      showToast(`Connected to ${result.name}!`, 'success');
      await deviceApi.connect({ deviceName: result.name, deviceId: result.id });
      emitDeviceConnected({ deviceName: result.name, deviceId: result.id });
    }
  }, [connect, emitDeviceConnected, showToast]);

  // ── Connect scanned device handler (Grid Selection) ────────────────────────
  const handleConnectDevice = useCallback(async (dev) => {
    if (dev.deviceObj.mock) {
      showToast(`Connecting to Mock Hardware: ${dev.name}...`, 'info');
      setIsMockConnected(true);
      setMockDeviceInfo({ name: dev.name, id: dev.id });
      showToast(`Connected to ${dev.name}!`, 'success');

      if (mockIntervalId) clearInterval(mockIntervalId);

      let _tilt = 30, _height = 10, _battery = 78, _voltage = true;
      const interval = setInterval(() => {
        _tilt = Math.max(0, Math.min(90, _tilt + (Math.random() - 0.5) * 3));
        _height = Math.max(0, Math.min(50, _height + (Math.random() - 0.5) * 0.5));
        _battery = Math.max(0, Math.min(100, _battery - Math.random() * 0.2));
        _voltage = Math.random() > 0.05;

        handleBluetoothData({
          deviceId: dev.id,
          tiltAngle: parseFloat(_tilt.toFixed(2)),
          height: parseFloat(_height.toFixed(2)),
          voltageStatus: _voltage,
          batterySOC: parseFloat(_battery.toFixed(1)),
          timestamp: new Date(),
          _receivedAt: new Date().getTime()
        });
      }, 1000);
      setMockIntervalId(interval);
      return;
    }

    showToast(`Connecting to ${dev.name}...`, 'info');
    const result = await connectDevice(dev);

    if (result) {
      showToast(`Connected to ${dev.name}!`, 'success');
      await deviceApi.connect({ deviceName: result.name, deviceId: result.id });
      emitDeviceConnected({ deviceName: result.name, deviceId: result.id });
    }
  }, [connectDevice, handleBluetoothData, mockIntervalId, showToast, emitDeviceConnected]);

  // ── Disconnect handler 
  const handleDisconnect = useCallback(async () => {
    localStorage.removeItem('lastConnectedDevice');
    setWasConnected(false);

    if (isMockConnected) {
      if (mockIntervalId) clearInterval(mockIntervalId);
      setMockIntervalId(null);
      setIsMockConnected(false);
      setMockDeviceInfo({ name: null, id: null });
      showToast('Mock hardware disconnected', 'warning');
      return;
    }

    const name = btConnected ? btDeviceInfo.name : deviceInfo.name;
    if (btConnected) {
      await disconnect();
    }

    if (name) {
      showToast(`Disconnected from ${name}`, 'warning');
      emitDeviceDisconnected({ deviceName: name });
      await deviceApi.disconnect(name);
    }
  }, [btConnected, isMockConnected, mockIntervalId, disconnect, emitDeviceDisconnected, btDeviceInfo, deviceInfo, showToast]);

  // ── Initialize ───────
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
        {/* Background decorations */}
        <div className="bg-grid" aria-hidden="true" />
        <div className="bg-glow bg-glow-1" aria-hidden="true" />
        <div className="bg-glow bg-glow-2" aria-hidden="true" />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <CloudDataView />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Background decorations */}
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow bg-glow-1" aria-hidden="true" />
      <div className="bg-glow bg-glow-2" aria-hidden="true" />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header
          deviceInfo={deviceInfo}
          isConnected={isConnected}
          isPhysicalConnected={btConnected || isMockConnected}
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
            deviceInfo={deviceInfo}
            isConnected={isConnected}
            isPhysicalConnected={btConnected || isMockConnected}
            onDisconnect={handleDisconnect}
            onReconnect={handleConnect}
          />
        )}
      </div>
    </>
  );
}
