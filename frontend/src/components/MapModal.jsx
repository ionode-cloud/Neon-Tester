import React, { useState, useEffect } from 'react';
import { RiMapPin2Fill, RiCloseLine } from 'react-icons/ri';

export default function MapModal({ location, deviceName, onClose }) {
  const [iframeError, setIframeError] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!location) return null;

  // Google Maps embed URL — pins the exact coordinates, zoom 17, satellite hybrid view
  const googleEmbedUrl =
    `https://maps.google.com/maps?q=${location.lat},${location.lng}` +
    `&z=17&output=embed&hl=en&t=k`;

  // Full Google Maps link (opens in new tab)
  const googleMapsUrl =
    `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;

  return (
    <div
      className="map-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Location Map"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="map-modal">

        {/* ── Header ── */}
        <div className="map-modal-header">
          <div className="map-modal-title">
            <RiMapPin2Fill style={{ color: 'var(--neon-cyan)', fontSize: '1.25rem' }} />
            <span className="font-display" style={{ fontSize: '0.95rem', letterSpacing: '0.08em', color: 'var(--neon-cyan)' }}>
              LIVE LOCATION
            </span>
            {deviceName && (
              <span className="map-device-chip">{deviceName}</span>
            )}
          </div>

          {/* Coordinates + accuracy */}
          <div className="map-modal-coords">
            <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </span>
            <span className="map-accuracy-chip">±{Math.round(location.accuracy || 0)}m</span>
          </div>

          {/* Open in Google Maps button */}
          <a
            id="btn-open-google-maps"
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{
              border: '1px solid rgba(0,229,255,0.3)',
              color: 'var(--neon-cyan)',
              background: 'rgba(0,229,255,0.06)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title="Open in Google Maps"
          >
            <RiMapPin2Fill />
            Open in Maps
          </a>

          {/* Close */}
          <button
            id="btn-close-map"
            className="btn btn-ghost btn-sm map-close-btn"
            onClick={onClose}
            aria-label="Close map"
          >
            <RiCloseLine style={{ fontSize: '1.2rem' }} />
          </button>
        </div>

        {/* ── Google Maps iframe ── */}
        <div className="map-container" style={{ position: 'relative' }}>
          {iframeError ? (
            /* Fallback if iframe is blocked */
            <div className="map-fallback">
              <RiMapPin2Fill style={{ fontSize: '3rem', color: 'var(--neon-cyan)', marginBottom: '1rem' }} />
              <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Map preview blocked by browser.
              </p>
              <p className="font-mono" style={{ color: 'var(--neon-green)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-md"
                style={{ textDecoration: 'none' }}
              >
                <RiMapPin2Fill />
                Open Google Maps
              </a>
            </div>
          ) : (
            <iframe
              id="google-maps-frame"
              title="Google Maps"
              src={googleEmbedUrl}
              width="100%"
              height="100%"
              style={{ border: 'none', display: 'block' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              onError={() => setIframeError(true)}
            />
          )}
        </div>

      </div>
    </div>
  );
}
