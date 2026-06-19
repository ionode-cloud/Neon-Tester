import React from 'react';
import { RiLoader4Line, RiMapPin2Fill, RiMapPinLine, RiSignalWifiErrorLine } from 'react-icons/ri';

export default function LocationCard({ location, error, loading, pairTime, onClick }) {
  const formatCoord = (val, isLat) => {
    if (val == null) return '--';
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    return `${Math.abs(val).toFixed(6)}° ${dir}`;
  };

  const formatPairTime = (date) => {
    if (!date) return '--';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZone: 'UTC',
    }).format(new Date(date));
  };

  const hasLocation = location && location.lat != null;

  return (
    <div
      className={`card loc-card ${hasLocation ? 'loc-card-active' : ''} ${loading ? 'loc-card-loading' : ''}`}
      onClick={hasLocation ? onClick : undefined}
      role={hasLocation ? 'button' : undefined}
      tabIndex={hasLocation ? 0 : undefined}
      onKeyDown={hasLocation ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-label={hasLocation ? 'View live location on map' : 'Waiting for GPS location'}
      title={hasLocation ? 'Click to view on map' : ''}
    >
      {/* Corner accent */}
      <div className="card-cornerAccent" style={{ background: hasLocation ? 'var(--neon-green)' : 'var(--neon-cyan)', opacity: 0.6 }} />

      {/* Header row */}
      <div className="card-header">
        <div className={`card-iconBox ${hasLocation ? 'card-icon-green' : 'card-icon-cyan'}`}>
          {loading ? <RiLoader4Line className="loc-spin" /> : hasLocation ? <RiMapPin2Fill /> : <RiMapPinLine />}
        </div>
        <div className="card-labelGroup">
          <span className="card-label section-label">Live Location</span>
          {pairTime && (
            <span className="card-subLabel">Paired at {formatPairTime(pairTime)}</span>
          )}
        </div>
        {hasLocation && (
          <div className="loc-map-hint">
            <RiMapPin2Fill />
            <span>Open in Google Maps</span>
          </div>
        )}
      </div>

      {/* Coords */}
      {error ? (
        <div className="loc-error">
          <RiSignalWifiErrorLine />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="loc-waiting">
          <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }} />
          <span>Acquiring GPS signal…</span>
        </div>
      ) : hasLocation ? (
        <div className="loc-coords">
          <div className="loc-coord-row">
            <span className="loc-coord-label">LAT</span>
            <span className="loc-coord-value font-mono">{formatCoord(location.lat, true)}</span>
          </div>
          <div className="loc-coord-row">
            <span className="loc-coord-label">LNG</span>
            <span className="loc-coord-value font-mono">{formatCoord(location.lng, false)}</span>
          </div>
          {location.accuracy != null && (
            <div className="loc-accuracy">
              <span>Accuracy:</span>
              <span className="font-mono" style={{ color: location.accuracy < 20 ? 'var(--neon-green)' : location.accuracy < 100 ? 'var(--neon-yellow)' : 'var(--neon-red)' }}>
                ±{Math.round(location.accuracy)}m
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
