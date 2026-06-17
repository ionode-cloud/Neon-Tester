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
  // Completely disabled as requested
  return {
    updateInfo: null,
    isChecking: false,
    isDownloading: false,
    isInstalling: false,
    downloadProgress: 0,
    error: null,
    dismissUpdate: () => {},
    triggerUpdate: () => {},
    manualCheck: () => {},
  };
}
