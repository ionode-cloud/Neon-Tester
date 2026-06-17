# Neon Tester — App Specification & Deployment Guide

> **App:** Neon Tester — Bluetooth IoT Monitoring Android App
> **Package:** `com.ionode.neontester`
> **Organization:** Ionode Cloud
> **Last Updated:** June 2026

---

## Table of Contents

1. [App Overview](#1-app-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Live URLs](#4-live-urls)
5. [OTA Auto-Update System](#5-ota-auto-update-system)
6. [How to Share the App](#6-how-to-share-the-app)
7. [How Updates Work for Users](#7-how-updates-work-for-users)
8. [Release a New Version (Step-by-Step)](#8-release-a-new-version-step-by-step)
9. [VPS Deployment](#9-vps-deployment)
10. [API Reference](#10-api-reference)
11. [Android Keystore — Critical Info](#11-android-keystore--critical-info)
12. [Environment Variables](#12-environment-variables)
13. [Key Rules — Never Break These](#13-key-rules--never-break-these)

---

## 1. App Overview

**Neon Tester** is a Capacitor-based Android application that:

- Connects to HC-05 Bluetooth devices via Web Bluetooth API
- Monitors real-time telemetry: tilt angle, height, voltage status, battery SOC, GPS location
- Streams live data to a cloud backend via Socket.IO
- Stores all readings in MongoDB Atlas
- Displays live dashboard, charts, and cloud data history
- Supports **OTA (Over-The-Air) automatic updates** — users get notified and can update without visiting any app store

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend UI** | React 18 + Vite |
| **Mobile Runtime** | Capacitor 8 (Android) |
| **Backend** | Node.js + Express |
| **Database** | MongoDB Atlas |
| **Real-time** | Socket.IO |
| **Bluetooth** | Web Bluetooth API + `@capacitor-community/bluetooth-le` |
| **OTA Updates** | Custom — `@capacitor/filesystem` + `@capacitor-community/file-opener` |
| **Hosting** | Hostinger VPS (Ubuntu) |
| **Process Manager** | PM2 |
| **Reverse Proxy** | Nginx |

---

## 3. Project Structure

```
Neon-Tester/
├── backend/
│   ├── server.js                  ← Express server entry point
│   ├── routes/
│   │   ├── device.js              ← Device data CRUD API
│   │   └── update.js              ← OTA update check + download API
│   ├── controllers/
│   │   └── deviceController.js
│   ├── models/
│   │   └── DeviceData.js          ← MongoDB schema
│   ├── uploads/
│   │   └── apks/                  ← APK files served for OTA downloads
│   │       └── README.txt         ← Release instructions
│   ├── update-config.json         ← ⭐ Edit this to trigger updates
│   └── .env                       ← MongoDB URI, PORT
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                ← Main app + update modal wiring
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ConnectionScreen.jsx
│   │   │   ├── CloudDataView.jsx
│   │   │   ├── StatusCard.jsx
│   │   │   ├── BatteryBar.jsx
│   │   │   └── UpdateModal.jsx    ← OTA update UI modal
│   │   ├── hooks/
│   │   │   ├── useBluetooth.js
│   │   │   ├── useSocket.js
│   │   │   ├── useLocation.js
│   │   │   └── useAppUpdate.js    ← OTA version check + polling hook
│   │   ├── services/
│   │   │   ├── api.js             ← Axios API client
│   │   │   └── updateService.js   ← APK download + install logic
│   │   └── index.css              ← Global design system
│   ├── android/                   ← Capacitor Android project
│   │   └── app/
│   │       ├── build.gradle       ← versionCode + versionName here
│   │       └── release/
│   │           └── app-release.apk ← Built signed APK (not in git)
│   ├── capacitor.config.ts
│   ├── .env                       ← Dev API URLs
│   └── .env.production            ← Production API URLs
│
└── appspecification.md            ← This file
```

---

## 4. Live URLs

| Service | URL |
|---|---|
| **Frontend Web App** | https://neontester.ionode.cloud |
| **Backend API** | https://neontester.api.ionode.cloud |
| **Update Check API** | https://neontester.api.ionode.cloud/api/update/check |
| **APK Download** | https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk |
| **Health Check** | https://neontester.api.ionode.cloud/health |
| **VPS IP (IPv4)** | `72.62.194.225` |
| **PM2 Process Name** | `neon-backend` (ID: 36) |

---

## 5. OTA Auto-Update System

### How It Works

```
App opens on user's phone
        │
        ▼ (3-second delay)
GET /api/update/check
        │
        ▼
Compare: server versionCode vs app's APP_VERSION_CODE
        │
   ┌────┴──────────────────┐
   │                       │
Same version           Newer version
   │                       │
No popup            Update modal appears
shown               ┌──────────────────────┐
                    │  Update Available    │
                    │  v1.0 → v1.0.1      │
                    │  [Update Now][Later] │
                    └──────────────────────┘
                             │
                    User taps "Update Now"
                             │
                    APK downloads (progress 0→100%)
                             │
                    Android PackageInstaller opens
                             │
                    User taps Install
                             │
                    App updates in place ✅
                    All data preserved ✅
```

### Key Files

| File | Purpose |
|---|---|
| `backend/update-config.json` | Controls what version is available |
| `backend/routes/update.js` | Serves the check API + streams APK |
| `frontend/src/services/updateService.js` | Version check, download, install logic |
| `frontend/src/hooks/useAppUpdate.js` | React hook — startup + 30-min polling |
| `frontend/src/components/UpdateModal.jsx` | Update UI modal |

### update-config.json Fields

```json
{
  "latestVersion": "1.0.1",    ← Human-readable version string
  "versionCode": 2,            ← Integer — must match build.gradle versionCode
  "apkUrl": "https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk",
  "forceUpdate": false,        ← true = blocks app until user updates
  "releaseNotes": "..."        ← Shown in the update dialog
}
```

### Force Update

Set `"forceUpdate": true` to **block the app** until users update:
- The update modal appears with NO "Later" button
- Users cannot use the app at all
- Only "Update Now" button is shown
- Use this for critical security fixes or breaking API changes

### Check Interval

- **Startup:** 3 seconds after app opens
- **Periodic:** Every 30 minutes while app is running
- **Manual:** Can be triggered via `manualCheck()` from `useAppUpdate` hook

---

## 6. How to Share the App

### Direct APK Download Link

Share this link with anyone:
```
https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk
```

### Share Methods

| Method | Steps |
|---|---|
| **WhatsApp / Telegram** | Send the APK URL → they tap → download → install |
| **Email** | Paste the link in email body |
| **QR Code** | Generate at qr-code-generator.com using the APK URL |
| **Your website** | `<a href="APK_URL">Download App</a>` |

### First-Time Install on Android

When someone installs for the first time:
1. They open the APK download link on their Android phone
2. APK file downloads to their phone
3. Android shows: **"Install from unknown sources"**
4. They tap **Settings → Allow from this source** → go back → **Install**
5. App installs ✅
6. From now on — all future updates happen **automatically inside the app** (no need to visit any link again)

> ℹ️ The "unknown sources" warning is normal for apps distributed outside Google Play Store. It only appears once on the first install.

---

## 7. How Updates Work for Users

Once a user has installed the app:

```
You push a code update (versionCode goes from 2 → 3)
                    │
                    ▼
     Next time user opens the app (within 3 seconds)
                    │
                    ▼
         ┌─────────────────────────┐
         │    Update Available     │
         │                         │
         │  Current:    1.0.1      │
         │  Latest:     1.0.2  →   │
         │                         │
         │  What's new:            │
         │  "New features added"   │
         │                         │
         │  [Update Now]  [Later]  │
         └─────────────────────────┘
                    │
         User taps "Update Now"
                    │
                    ▼
         ┌─────────────────────────┐
         │  Downloading...  67%   │
         │  ████████░░░░░░░       │
         └─────────────────────────┘
                    │
                    ▼
         Android "Install application?" dialog
                    │
         User taps Install
                    │
                    ▼
         ✅ App updated to v1.0.2
         ✅ All data preserved
         ✅ Login session preserved
         ✅ No uninstall required
```

---

## 8. Release a New Version (Step-by-Step)

### Step 1 — Make your code changes
Edit React components, hooks, styles etc. in `frontend/src/`

### Step 2 — Build the frontend
```powershell
cd "C:\...\Neon-tester\frontend"
npm run build
npx cap sync android
```

### Step 3 — Bump version in build.gradle
Edit `frontend/android/app/build.gradle`:
```groovy
defaultConfig {
    versionCode 3           ← increment by 1
    versionName "1.0.2"    ← update label
}
```

Also update `APP_VERSION_CODE` in `frontend/src/services/updateService.js`:
```js
export const APP_VERSION_CODE = 3;   // must match build.gradle
export const APP_VERSION_NAME = '1.0.2';
```

### Step 4 — Build signed release APK in Android Studio
```
Build → Generate Signed Bundle / APK → APK → Next
→ Choose existing keystore: C:\keys\neon-tester.jks
→ Enter passwords
→ Next → Build Variant: release → Finish
```

APK location after build:
```
frontend\android\app\release\app-release.apk
```

### Step 5 — Upload APK to VPS
```powershell
scp "C:\...\frontend\android\app\release\app-release.apk" root@72.62.194.225:~/Neon-Tester/backend/uploads/apks/neon-tester-v1.0.2.apk
```

### Step 6 — Update config on VPS
```bash
nano ~/Neon-Tester/backend/update-config.json
```
```json
{
  "latestVersion": "1.0.2",
  "versionCode": 3,
  "apkUrl": "https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.2.apk",
  "forceUpdate": false,
  "releaseNotes": "Describe what changed in this version."
}
```
Save: `Ctrl+O` → `Enter` → `Ctrl+X`

### Step 7 — Restart backend
```bash
pm2 restart neon-backend
```

### Step 8 — Verify
```bash
# Check APK is accessible
curl -I https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.2.apk
# → HTTP/2 200 ✅

# Check API returns new version
curl https://neontester.api.ionode.cloud/api/update/check
# → {"versionCode":3,...} ✅
```

**All installed devices will see the update popup on next app open.** ✅

---

## 9. VPS Deployment

### Server Details

| Item | Value |
|---|---|
| **Provider** | Hostinger VPS |
| **OS** | Ubuntu (Nginx 1.28.0) |
| **IPv4** | `72.62.194.225` |
| **IPv6** | `2a02:4780:5e:417a::1` |
| **SSH** | `ssh root@72.62.194.225` |
| **Project Path** | `/root/Neon-Tester/` |

### PM2 Process

```bash
pm2 status          # check all processes
pm2 logs neon-backend   # view live logs
pm2 restart neon-backend  # restart after config changes
pm2 save            # save process list (survives reboots)
```

### Deploy New Code (after git push)

```bash
cd ~/Neon-Tester
git stash
git pull origin main
git stash pop
cd backend
npm install
pm2 restart neon-backend
```

### Backend .env

```env
PORT=5000
MONGODB_URI=mongodb+srv://...@ionode.ckcssnb.mongodb.net/Neon-tester
CLIENT_URL=https://neontester.ionode.cloud
```

---

## 10. API Reference

### Update API

#### `GET /api/update/check`
Returns the current update manifest.

**Response:**
```json
{
  "latestVersion": "1.0.1",
  "versionCode": 2,
  "apkUrl": "https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk",
  "forceUpdate": false,
  "releaseNotes": "Bug fixes and performance improvements."
}
```

#### `GET /downloads/:filename`
Streams the APK file with proper Android MIME type.

**Example:**
```
GET https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk
Content-Type: application/vnd.android.package-archive
```

### Device API

| Endpoint | Method | Description |
|---|---|---|
| `/device/status` | GET | Get current connection status |
| `/device/history` | GET | Get paginated telemetry records |
| `/device/connect` | POST | Report device connect/disconnect |
| `/device` | GET/POST/PUT/DELETE | CRUD telemetry data |
| `/device/all` | DELETE | Clear all records |
| `/health` | GET | Server health check |

---

## 11. Android Keystore — Critical Info

> ⚠️ **THIS IS THE MOST IMPORTANT FILE IN THE ENTIRE PROJECT**

| Detail | Value |
|---|---|
| **File location** | `C:\keys\neon-tester.jks` |
| **Key alias** | `neon-tester-key` |
| **Validity** | 25 years |
| **Used for** | Signing every release APK |

### Why it matters

- Android checks the **signing certificate** of every update
- The update APK **must be signed with the same key** as the installed app
- If you lose the keystore or use a different one → **Android will REJECT the update**
- Users would need to **manually uninstall and reinstall** to use the new version
- There is **no way to recover** a lost keystore

### Backup Immediately

Copy `C:\keys\neon-tester.jks` to:
- ✅ Google Drive
- ✅ USB drive
- ✅ Email it to yourself

---

## 12. Environment Variables

### Backend (`backend/.env`)
```env
PORT=5000
MONGODB_URI=mongodb+srv://ionodecloud_db_user:...@ionode.ckcssnb.mongodb.net/Neon-tester
CLIENT_URL=https://neontester.ionode.cloud
```

### Frontend Dev (`frontend/.env`)
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
VITE_APP_NAME=Neon Monitor
```

### Frontend Production (`frontend/.env.production`)
```env
VITE_API_BASE_URL=https://neontester.api.ionode.cloud
VITE_SOCKET_URL=https://neontester.api.ionode.cloud
VITE_APP_NAME=Neon Monitor
```

---

## 13. Key Rules — Never Break These

| Rule | Consequence if broken |
|---|---|
| ✅ Always use the **same keystore** `.jks` for every release | Users cannot update — must reinstall |
| ✅ Always **increment `versionCode`** by at least 1 | No update triggered for users |
| ✅ Keep package name `com.ionode.neontester` unchanged | Treated as a completely different app |
| ✅ APK filename in `/uploads/apks/` must match `apkUrl` in config | 404 on download |
| ✅ Run `npm run build && npx cap sync android` before building APK | APK has old code |
| ✅ `APP_VERSION_CODE` in `updateService.js` must match `build.gradle` | Update check broken |
| ✅ Always `pm2 restart neon-backend` after editing `update-config.json` | Old config still served |

---

## Version History

| Version | versionCode | Date | Notes |
|---|---|---|---|
| 1.0 | 1 | June 2026 | Initial release — BLE monitoring + OTA system |
| 1.0.1 | 2 | June 2026 | OTA update system live, Close button fix |

---

*Generated by Antigravity AI — Ionode Cloud / Neon Tester Project*
