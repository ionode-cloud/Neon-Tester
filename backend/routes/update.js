const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');

// ─── Path to the single source-of-truth manifest ──────────────────────────────
const CONFIG_PATH = path.join(__dirname, '..', 'update-config.json');
const APKS_DIR    = path.join(__dirname, '..', 'uploads', 'apks');

// ─── Helper: read config safely ───────────────────────────────────────────────
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[UPDATE] Failed to read update-config.json:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/update/check
// Returns the current update manifest.
// The Android app compares its own versionCode with the returned versionCode.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/check', (req, res) => {
  const config = readConfig();

  if (!config) {
    return res.status(500).json({ error: 'Update configuration unavailable. Try again later.' });
  }

  // Validate required fields
  const { latestVersion, versionCode, apkUrl, forceUpdate, releaseNotes } = config;

  if (!latestVersion || versionCode === undefined || !apkUrl) {
    return res.status(500).json({ error: 'Update config is malformed.' });
  }

  // Build the full absolute APK URL so the client can download it
  // We detect the host from the request so this works on any deployment.
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host     = req.headers['x-forwarded-host']  || req.get('host');
  const baseUrl  = `${protocol}://${host}`;

  // If apkUrl is already absolute (https://...) keep it; otherwise prefix host
  const fullApkUrl = apkUrl.startsWith('http')
    ? apkUrl
    : `${baseUrl}${apkUrl}`;

  return res.json({
    latestVersion : latestVersion,
    versionCode   : Number(versionCode),
    apkUrl        : fullApkUrl,
    forceUpdate   : Boolean(forceUpdate),
    releaseNotes  : releaseNotes || '',
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/update/download/:filename
// Streams an APK file from the uploads/apks directory.
// Sets correct headers so Android can identify it as an APK.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;

  // Security: prevent path traversal attacks (e.g. "../../etc/passwd")
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !safeFilename.endsWith('.apk')) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }

  const apkPath = path.join(APKS_DIR, safeFilename);

  if (!fs.existsSync(apkPath)) {
    console.warn(`[UPDATE] APK not found: ${apkPath}`);
    return res.status(404).json({ error: `APK file "${safeFilename}" not found on server.` });
  }

  const stat     = fs.statSync(apkPath);
  const fileSize = stat.size;

  // Support range requests (allows resumable downloads)
  const rangeHeader = req.headers['range'];
  if (rangeHeader) {
    const parts  = rangeHeader.replace(/bytes=/, '').split('-');
    const start  = parseInt(parts[0], 10);
    const end    = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range'       : `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges'       : 'bytes',
      'Content-Length'      : chunkSize,
      'Content-Type'        : 'application/vnd.android.package-archive',
      'Content-Disposition' : `attachment; filename="${safeFilename}"`,
    });

    const fileStream = fs.createReadStream(apkPath, { start, end });
    fileStream.pipe(res);
    fileStream.on('error', (err) => {
      console.error('[UPDATE] Stream error (range):', err.message);
      res.end();
    });
  } else {
    res.writeHead(200, {
      'Content-Length'      : fileSize,
      'Content-Type'        : 'application/vnd.android.package-archive',
      'Content-Disposition' : `attachment; filename="${safeFilename}"`,
      'Accept-Ranges'       : 'bytes',
    });

    const fileStream = fs.createReadStream(apkPath);
    fileStream.pipe(res);
    fileStream.on('error', (err) => {
      console.error('[UPDATE] Stream error:', err.message);
      res.end();
    });
  }
});

module.exports = router;
