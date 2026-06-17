APK UPLOAD FOLDER — Neon Tester OTA Updates
════════════════════════════════════════════════════════════════════════════

Once uploaded, APKs are served at:
  https://neontester.api.ionode.cloud/downloads/<filename>

════════════════════════════════════════════════════════════════════════════
HOW TO RELEASE A NEW VERSION (end-to-end)
════════════════════════════════════════════════════════════════════════════

STEP 1 — Bump versionCode in Android
─────────────────────────────────────
Edit  frontend/android/app/build.gradle:

    versionCode 2            ← increment by 1 each time
    versionName "1.0.1"     ← human-readable label

STEP 2 — Build a signed Release APK
─────────────────────────────────────
Option A — Android Studio (recommended):
  Build → Generate Signed Bundle / APK → APK → Release

Option B — Command line:
  cd frontend
  npm run build
  npx cap sync android
  cd android
  ./gradlew assembleRelease
  # APK will be at: android/app/build/outputs/apk/release/app-release.apk

IMPORTANT: Use the SAME keystore as always.
Package name (com.ionode.neontester) must NEVER change.

STEP 3 — Upload APK to the server
─────────────────────────────────────
From your local machine:

  scp app-release.apk root@YOUR_VPS_IP:~/Neon-Tester/backend/uploads/apks/neon-tester-v1.0.1.apk

Or via SFTP/FileZilla — upload to:
  ~/Neon-Tester/backend/uploads/apks/

Verify the public URL works:
  curl -I https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk
  # Should return HTTP 200 with Content-Type: application/vnd.android.package-archive

STEP 4 — Update the manifest
─────────────────────────────────────
Edit  backend/update-config.json:

  {
    "latestVersion": "1.0.1",
    "versionCode": 2,
    "apkUrl": "https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk",
    "forceUpdate": false,
    "releaseNotes": "Bug fixes and performance improvements."
  }

  forceUpdate: true  → users CANNOT use app until they update
  forceUpdate: false → users see "Update Now" + "Later" option

STEP 5 — Restart the backend
─────────────────────────────────────
  pm2 restart all

Or if not using pm2:
  node server.js

STEP 6 — Verify the API
─────────────────────────────────────
  curl https://neontester.api.ionode.cloud/api/update/check

Expected response:
  {
    "latestVersion": "1.0.1",
    "versionCode": 2,
    "apkUrl": "https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk",
    "forceUpdate": false,
    "releaseNotes": "Bug fixes and performance improvements."
  }

════════════════════════════════════════════════════════════════════════════
HOW THE APP UPDATE WORKS (user experience)
════════════════════════════════════════════════════════════════════════════

1. App starts → checks /api/update/check after 3 seconds
2. If versionCode on server > app's versionCode → modal appears:
     "Update Available — v1.0.1 is ready"
     [Update Now]  [Later]
3. User taps "Update Now" → APK downloads with progress bar (0–100%)
4. Android PackageInstaller launches → standard "Install?" dialog
5. User taps Install → app updates in place
   ✅ No uninstall needed
   ✅ All user data, localStorage, login sessions preserved
   ✅ App rechecks every 30 minutes while running

════════════════════════════════════════════════════════════════════════════
RULES — DO NOT BREAK THESE
════════════════════════════════════════════════════════════════════════════

• Always increment versionCode by at least 1.
• Always use the SAME signing keystore for every release.
• NEVER change the package name: com.ionode.neontester
• APK filename in the folder MUST match the apkUrl in update-config.json.

════════════════════════════════════════════════════════════════════════════
