/**
 * updateService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all logic for:
 *   1. Checking the backend for a newer APK version
 *   2. Downloading the APK with streamed progress reporting
 *   3. Triggering the native Android PackageInstaller
 *
 * Works ONLY inside a Capacitor Android context (Filesystem + FileOpener APIs).
 * Falls back gracefully on web/browser (no crash, just no download action).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// ─── Current app version — keep this in sync with android/app/build.gradle ──
// versionCode must be a plain integer (matches build.gradle versionCode field)
export const APP_VERSION_NAME = '1.0.1';
export const APP_VERSION_CODE = 2;   // ← increment this with every new build

const UPDATE_CHECK_URL = `${import.meta.env.VITE_API_BASE_URL || ''}/api/update/check`;

// ─────────────────────────────────────────────────────────────────────────────
// checkForUpdate()
// Fetches the update manifest and returns it if a newer version is available.
// Returns null if the app is already up-to-date or the check fails silently.
// Throws an Error only on network/server failures (caller decides how to handle).
// ─────────────────────────────────────────────────────────────────────────────
export async function checkForUpdate() {
  let response;
  try {
    response = await fetch(UPDATE_CHECK_URL, {
      method : 'GET',
      headers: { 'Accept': 'application/json' },
      // 8-second timeout via AbortController
      signal : AbortSignal.timeout(8000),
    });
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      throw new Error('Update check timed out. Please check your internet connection.');
    }
    if (err.message.toLowerCase().includes('network') ||
        err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error('No internet connection. Cannot check for updates.');
    }
    throw new Error(`Update check failed: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`Server error ${response.status} while checking for updates.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Received an invalid response from the update server.');
  }

  // Validate manifest shape
  if (
    typeof data.versionCode !== 'number' ||
    typeof data.latestVersion !== 'string' ||
    typeof data.apkUrl !== 'string'
  ) {
    throw new Error('Update manifest is malformed.');
  }

  // Compare server versionCode with our bundled APP_VERSION_CODE
  if (data.versionCode <= APP_VERSION_CODE) {
    return null; // already up-to-date
  }

  return data; // { latestVersion, versionCode, apkUrl, forceUpdate, releaseNotes }
}


// ─────────────────────────────────────────────────────────────────────────────
// downloadApk(apkUrl, onProgress)
// Downloads the APK using the Fetch Streams API, writing chunks to the
// Capacitor Filesystem Cache directory.
// onProgress(percent: number) is called with 0–100 as chunks arrive.
// Returns the local file URI that FileOpener needs.
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadApk(apkUrl, onProgress) {
  if (typeof onProgress !== 'function') onProgress = () => {};

  const fileName = `neon-tester-update.apk`;

  // On Native Platforms, use Filesystem.downloadFile for progress and native network performance
  if (Capacitor.isNativePlatform()) {
    let progressListener;
    try {
      progressListener = await Filesystem.addListener('progress', (progress) => {
        if (progress.contentLength > 0) {
          onProgress(Math.min(99, Math.round((progress.bytes / progress.contentLength) * 100)));
        } else {
          onProgress(50); // Fallback progress
        }
      });

      await Filesystem.downloadFile({
        url: apkUrl,
        path: fileName,
        directory: Directory.Cache,
        progress: true
      });
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('space')) {
        throw new Error('Insufficient storage space. Please free up some space and try again.');
      }
      throw new Error(`Download failed: ${err.message}`);
    } finally {
      if (progressListener) {
        try {
          await progressListener.remove();
        } catch (e) {
          console.warn('[updateService] Failed to remove progress listener:', e);
        }
      }
    }
  } else {
    // Browser fallback: Use standard fetch streaming
    let response;
    try {
      response = await fetch(apkUrl, {
        method: 'GET',
      });
    } catch (err) {
      if (err.message.toLowerCase().includes('network') ||
          err.message.toLowerCase().includes('failed to fetch')) {
        throw new Error('Download failed: No internet connection.');
      }
      throw new Error(`Download failed: ${err.message}`);
    }

    if (!response.ok) {
      throw new Error(`Download failed: Server returned HTTP ${response.status}.`);
    }

    const contentLength = response.headers.get('Content-Length');
    const totalBytes    = contentLength ? parseInt(contentLength, 10) : 0;

    const reader  = response.body.getReader();
    const chunks  = [];
    let receivedBytes = 0;

    while (true) {
      let done, value;
      try {
        ({ done, value } = await reader.read());
      } catch {
        throw new Error('Download interrupted. Please try again.');
      }
      if (done) break;

      chunks.push(value);
      receivedBytes += value.length;

      if (totalBytes > 0) {
        onProgress(Math.min(99, Math.round((receivedBytes / totalBytes) * 100)));
      } else {
        onProgress(Math.min(90, Math.round((receivedBytes / (receivedBytes + 500_000)) * 90)));
      }
    }

    onProgress(99);

    const totalLength  = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged       = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < merged.length; i += CHUNK) {
      binary += String.fromCharCode(...merged.subarray(i, i + CHUNK));
    }
    const base64Data = btoa(binary);

    try {
      await Filesystem.writeFile({
        path      : fileName,
        data      : base64Data,
        directory : Directory.Cache,
      });
    } catch (err) {
      throw new Error(`Failed to save APK to device: ${err.message}`);
    }
  }

  onProgress(100);

  // ── Return the full file URI for FileOpener ─────────────────────────────
  try {
    const uriResult = await Filesystem.getUri({
      path      : fileName,
      directory : Directory.Cache,
    });
    return uriResult.uri;
  } catch (err) {
    throw new Error(`Could not locate downloaded APK: ${err.message}`);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// installApk(fileUri)
// Opens the APK using the native Android PackageInstaller via FileOpener.
// The user will see the standard Android "Install application?" dialog.
// The app does NOT need to be uninstalled first — Android handles the upgrade.
// ─────────────────────────────────────────────────────────────────────────────
export async function installApk(fileUri) {
  // Dynamic import so tree-shaking removes it on web builds
  let FileOpener;
  try {
    const mod = await import('@capacitor-community/file-opener');
    FileOpener = mod.FileOpener;
  } catch {
    throw new Error(
      'FileOpener plugin not available. Make sure @capacitor-community/file-opener is installed and synced.'
    );
  }

  try {
    await FileOpener.open({
      filePath  : fileUri,
      contentType: 'application/vnd.android.package-archive',
      openWithDefault: true,
    });
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('invalid')) {
      throw new Error('The downloaded APK appears to be invalid or corrupted. Please try again.');
    }
    throw new Error(`Could not launch installer: ${err.message}`);
  }
}
