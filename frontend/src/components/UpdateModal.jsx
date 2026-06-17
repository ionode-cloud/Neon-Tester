/**
 * UpdateModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen overlay modal for the OTA update system.
 *
 * States handled:
 *   • Normal update  — shows version info + "Update Now" + "Later" buttons
 *   • Force update   — shows version info + "Update Now" ONLY (no dismiss)
 *   • Downloading    — animated progress bar + percentage
 *   • Installing     — "Launching installer…" spinner
 *   • Error          — error message + Retry button
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { APP_VERSION_NAME } from '../services/updateService';

export default function UpdateModal({
  updateInfo,      // { latestVersion, versionCode, apkUrl, forceUpdate, releaseNotes }
  isDownloading,
  isInstalling,
  downloadProgress,
  error,
  onUpdate,        // () => void — triggers download + install
  onDismiss,       // () => void — null/undefined for force-update
}) {
  if (!updateInfo) return null;

  const isForce  = Boolean(updateInfo.forceUpdate);
  const isBusy   = isDownloading || isInstalling;

  return (
    /* ── Backdrop ──────────────────────────────────────────────────────────── */
    <div
      className={`update-modal-backdrop ${isForce ? 'update-modal-force' : ''}`}
      aria-modal="true"
      role="dialog"
      aria-labelledby="update-modal-title"
    >
      {/* ── Modal card ──────────────────────────────────────────────────────── */}
      <div className="update-modal-card animate-fadeInUp">

        {/* Decorative corner accent */}
        <div className="update-modal-corner" aria-hidden="true" />

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="update-modal-header">
          <div className="update-modal-icon-wrap">
            <span className="update-modal-icon" aria-hidden="true">⬆</span>
          </div>
          <div>
            <h2 id="update-modal-title" className="update-modal-title">
              {isForce ? 'Update Required' : 'Update Available'}
            </h2>
            <p className="update-modal-subtitle">
              {isForce
                ? 'You must update to continue using this app.'
                : 'A new version of Neon Tester is available.'}
            </p>
          </div>
        </div>

        {/* ── Version info ──────────────────────────────────────────────────── */}
        <div className="update-modal-versions">
          <div className="update-modal-version-chip update-modal-version-old">
            <span className="update-modal-version-label">Current</span>
            <span className="update-modal-version-val">{APP_VERSION_NAME}</span>
          </div>
          <div className="update-modal-arrow" aria-hidden="true">→</div>
          <div className="update-modal-version-chip update-modal-version-new">
            <span className="update-modal-version-label">Latest</span>
            <span className="update-modal-version-val">{updateInfo.latestVersion}</span>
          </div>
        </div>

        {/* ── Release notes ─────────────────────────────────────────────────── */}
        {updateInfo.releaseNotes && !isBusy && (
          <div className="update-modal-notes">
            <span className="update-modal-notes-label">What&apos;s new</span>
            <p className="update-modal-notes-text">{updateInfo.releaseNotes}</p>
          </div>
        )}

        {/* ── Download progress ─────────────────────────────────────────────── */}
        {isDownloading && (
          <div className="update-modal-progress-wrap">
            <div className="update-modal-progress-header">
              <span className="update-modal-progress-label">Downloading update…</span>
              <span className="update-modal-progress-pct">{downloadProgress}%</span>
            </div>
            <div
              className="update-modal-progress-track"
              role="progressbar"
              aria-valuenow={downloadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Download progress"
            >
              <div
                className="update-modal-progress-fill"
                style={{ width: `${downloadProgress}%` }}
              >
                <div className="update-modal-progress-shimmer" />
              </div>
            </div>
            <p className="update-modal-progress-hint">
              Please keep the app open during download.
            </p>
          </div>
        )}

        {/* ── Installing state ──────────────────────────────────────────────── */}
        {isInstalling && (
          <div className="update-modal-installing">
            <div className="spinner" style={{ width: 28, height: 28 }} />
            <span className="update-modal-installing-text">Launching installer…</span>
          </div>
        )}

        {/* ── Error message ─────────────────────────────────────────────────── */}
        {error && !isBusy && (
          <div className="update-modal-error" role="alert">
            <span className="update-modal-error-icon" aria-hidden="true">⚠</span>
            <p className="update-modal-error-text">{error}</p>
          </div>
        )}

        {/* ── Action buttons ────────────────────────────────────────────────── */}
        {!isBusy && (
          <div className="update-modal-actions">
            <button
              id="update-now-btn"
              className="btn btn-primary btn-lg update-modal-btn-update"
              onClick={onUpdate}
              disabled={isBusy}
              aria-label="Download and install the update"
            >
              <span className="update-modal-btn-icon" aria-hidden="true">⬇</span>
              {error ? 'Retry Update' : 'Update Now'}
            </button>

            {/* Only show "Later" for non-force updates */}
            {!isForce && onDismiss && (
              <button
                id="update-later-btn"
                className="btn btn-ghost update-modal-btn-later"
                onClick={onDismiss}
                aria-label="Dismiss update and continue using the app"
              >
                Later
              </button>
            )}
          </div>
        )}

        {/* Force-update: show a lock note at the bottom */}
        {isForce && !isBusy && (
          <p className="update-modal-lock-note">
            🔒 App access is locked until the update is installed.
          </p>
        )}
      </div>
    </div>
  );
}
