/**
 * useAppUpdate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom React hook that manages the entire update lifecycle:
 *   • Checks for an update immediately on app startup
 *   • Re-checks every 30 minutes while the app is open
 *   • Exposes download + install trigger with real-time progress
 *   • Exposes dismiss (blocked for force-update)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { checkForUpdate, downloadApk, installApk } from '../services/updateService';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export default function useAppUpdate() {
  // The full update manifest object (or null when no update / not yet checked)
  const [updateInfo, setUpdateInfo]           = useState(null);

  // true while the background version check is in flight
  const [isChecking, setIsChecking]           = useState(false);

  // true while the APK is being downloaded
  const [isDownloading, setIsDownloading]     = useState(false);

  // 0–100 during download
  const [downloadProgress, setDownloadProgress] = useState(0);

  // true once download is complete and installer has been launched
  const [isInstalling, setIsInstalling]       = useState(false);

  // Human-readable error message (or null)
  const [error, setError]                     = useState(null);

  // Prevent concurrent checks
  const checkingRef = useRef(false);

  // ── Version check ──────────────────────────────────────────────────────────
  const runCheck = useCallback(async (silent = false) => {
    if (checkingRef.current) return;
    checkingRef.current = true;

    if (!silent) setIsChecking(true);
    setError(null);

    try {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
      }
      // If info is null → already up-to-date; leave updateInfo as-is
    } catch (err) {
      // Silent startup checks: swallow network errors so the user isn't
      // bothered if they're offline. Only surface errors for manual checks.
      if (!silent) {
        setError(err.message);
      } else {
        console.warn('[useAppUpdate] Silent check error:', err.message);
      }
    } finally {
      if (!silent) setIsChecking(false);
      checkingRef.current = false;
    }
  }, []);

  // ── Startup check ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Small delay so the app UI renders first before the network request fires
    const startupTimer = setTimeout(() => runCheck(true), 3000);
    return () => clearTimeout(startupTimer);
  }, [runCheck]);

  // ── Periodic re-check every 30 min ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => runCheck(true), CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runCheck]);

  // ── Dismiss (only allowed when forceUpdate is false) ──────────────────────
  const dismissUpdate = useCallback(() => {
    if (updateInfo?.forceUpdate) return; // cannot dismiss a force-update
    setUpdateInfo(null);
    setError(null);
    setDownloadProgress(0);
  }, [updateInfo]);

  // ── Download + Install ─────────────────────────────────────────────────────
  const triggerUpdate = useCallback(async () => {
    if (!updateInfo?.apkUrl) {
      setError('No APK URL available. Please try again later.');
      return;
    }

    setIsDownloading(true);
    setIsInstalling(false);
    setDownloadProgress(0);
    setError(null);

    let fileUri;
    try {
      fileUri = await downloadApk(updateInfo.apkUrl, (pct) => {
        setDownloadProgress(pct);
      });
    } catch (err) {
      setIsDownloading(false);
      setDownloadProgress(0);
      setError(err.message);
      return;
    }

    // Download complete — hand off to native installer
    setIsDownloading(false);
    setIsInstalling(true);

    try {
      await installApk(fileUri);
      // After this point Android takes over; the app may be killed/restarted.
      // We leave isInstalling = true so the UI shows "Launching installer…"
    } catch (err) {
      setIsInstalling(false);
      setError(err.message);
    }
  }, [updateInfo]);

  // ── Manual re-check (can be triggered from UI) ────────────────────────────
  const manualCheck = useCallback(() => runCheck(false), [runCheck]);

  return {
    updateInfo,
    isChecking,
    isDownloading,
    isInstalling,
    downloadProgress,
    error,
    dismissUpdate,
    triggerUpdate,
    manualCheck,
  };
}
