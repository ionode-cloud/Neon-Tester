import React, { useState, useEffect, useCallback } from 'react';
import { RiDatabase2Line } from 'react-icons/ri';
import { deviceApi } from '../services/api';
import BatteryBar from './BatteryBar';

export default function CloudDataView({ lastCreated, lastUpdated, lastDeleted, lastAllDeleted }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [limit, setLimit] = useState(15);

  const fetchData = useCallback((isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
    }
    deviceApi.getHistory({
      page,
      limit,
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
        if (!isBackground) {
          setLoading(false);
        }
      });
  }, [page, limit]);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  useEffect(() => {
    if (lastCreated || lastUpdated || lastDeleted || lastAllDeleted) {
      fetchData(true);
    }
  }, [lastCreated, lastUpdated, lastDeleted, lastAllDeleted, fetchData]);

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
    const headers = ['Timestamp', 'Device ID', 'Tilt Angle (°)', 'Height (m)', 'Voltage Status', 'Battery SOC (%)', 'Latitude', 'Longitude'];
    const csvRows = [
      headers.join(','),
      ...data.map((row) => [
        new Date(row.timestamp).toISOString(),
        row.deviceId,
        row.tiltAngle,
        row.height,
        row.voltageStatus ? 'ACTIVE' : 'INACTIVE',
        row.batterySOC,
        row.latitude !== undefined && row.latitude !== null ? row.latitude : '',
        row.longitude !== undefined && row.longitude !== null ? row.longitude : '',
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
            Export CSV
          </button>
          <button onClick={fetchData} className="btn btn-ghost btn-sm">
            Refresh
          </button>
          <button onClick={handleClearAllData} className="btn btn-danger btn-sm" title="Delete all records from the database">
            Clear Data
          </button>
          <button
            onClick={() => window.location.replace(window.location.origin + window.location.pathname.replace(/\/$/, '') || '/')}
            className="btn btn-ghost btn-sm"
          >
            Close
          </button>
        </div>
      </div>

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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
