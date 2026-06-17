# VPS Production Update Guide — Neon Tester

> **Server:** `72.62.194.225` | **PM2 Process:** `neon-backend` (ID: 36)
> **Project Path:** `/root/Neon-Tester/`
> **Backend API:** `https://neontester.api.ionode.cloud`
> **Frontend Web:** `https://neontester.ionode.cloud`

---

## Two Types of Updates

| Type | What Changed | APK Needed? |
|---|---|---|
| **Type A — Backend only** | Node.js routes, API logic, MongoDB models | ❌ No |
| **Type B — Frontend + Android** | React UI, hooks, components, styles | ✅ Yes (new APK) |

---

## TYPE A — Backend Code Change Only

> Use this when you only changed files inside `backend/` folder.

### On Your LOCAL Machine

**Step 1 — Make your changes** in `backend/` files, test locally.

**Step 2 — Commit and push to GitHub:**
```powershell
cd "C:\Users\jyoti\Desktop\Currently Working\Robo Project\Neon-tester"
git add .
git commit -m "fix: describe what you changed"
git push origin main
```

---

### On Your VPS (SSH in first)

```bash
ssh root@72.62.194.225
```

**Step 3 — Pull the latest code:**
```bash
cd ~/Neon-Tester
git stash
git pull origin main
git stash pop
```

**Step 4 — Install any new packages (if you added any):**
```bash
cd backend
npm install
```

**Step 5 — Restart the backend:**
```bash
pm2 restart neon-backend
```

**Step 6 — Verify it's running:**
```bash
pm2 status
# → neon-backend should show "online"

pm2 logs neon-backend --lines 20
# → Check for any errors
```

**Step 7 — Test the API:**
```bash
curl https://neontester.api.ionode.cloud/health
# → {"status":"ok","db":"connected"}
```

✅ **Done! Backend is updated.**

---

## TYPE B — Frontend (React/UI) Code Change

> Use this when you changed files inside `frontend/src/` — components, hooks, styles, etc.
> This requires building a new APK and uploading it so installed apps auto-update.

---

### PHASE 1 — Local Machine (Windows)

**Step 1 — Make your React code changes** in `frontend/src/`

**Step 2 — Build the production frontend:**
```powershell
cd "C:\Users\jyoti\Desktop\Currently Working\Robo Project\Neon-tester\frontend"
npm run build
```
> This creates the `dist/` folder with the compiled React app.

**Step 3 — Sync to Android project:**
```powershell
npx cap sync android
```
> This copies the built web app into the Android project.

**Step 4 — Bump the version in `build.gradle`:**

Open this file:
```
frontend\android\app\build.gradle
```

Change:
```groovy
versionCode 2       ← increment by 1 (e.g. 2 → 3)
versionName "1.0.1" ← update label (e.g. "1.0.1" → "1.0.2")
```

**Step 5 — Also update `updateService.js`:**

Open `frontend\src\services\updateService.js` and change:
```js
export const APP_VERSION_CODE = 3;      // must match build.gradle versionCode
export const APP_VERSION_NAME = '1.0.2'; // must match build.gradle versionName
```

**Step 6 — Build signed release APK in Android Studio:**

Open Android Studio → open `frontend\android` folder

```
Build → Generate Signed Bundle / APK
→ APK → Next
→ Key store path: C:\keys\neon-tester.jks
→ Enter Key store password
→ Key alias: neon-tester-key
→ Enter Key password
→ Next
→ Build Variant: release
→ Signature Versions: ✅ V1  ✅ V2
→ Finish
```

Wait for build to complete (1–3 minutes).

APK will be at:
```
frontend\android\app\release\app-release.apk
```

**Step 7 — Upload APK to VPS:**

Open PowerShell and run (replace `v1.0.2` with your new version):
```powershell
scp "C:\Users\jyoti\Desktop\Currently Working\Robo Project\Neon-tester\frontend\android\app\release\app-release.apk" root@72.62.194.225:~/Neon-Tester/backend/uploads/apks/neon-tester-v1.0.2.apk
```
Enter SSH password → wait for upload (3–5 MB, takes ~10 seconds).

**Step 8 — Commit and push all code changes to GitHub:**
```powershell
cd "C:\Users\jyoti\Desktop\Currently Working\Robo Project\Neon-tester"
git add .
git commit -m "feat: describe your changes - v1.0.2"
git push origin main
```

---

### PHASE 2 — VPS (SSH in)

```bash
ssh root@72.62.194.225
```

**Step 9 — Pull latest code:**
```bash
cd ~/Neon-Tester
git stash
git pull origin main
git stash pop
```

**Step 10 — Install packages (if any new ones added):**
```bash
cd backend
npm install
```

**Step 11 — Verify APK was uploaded:**
```bash
ls -lh ~/Neon-Tester/backend/uploads/apks/
```
You should see your new APK file listed.

**Step 12 — Update the update-config.json:**
```bash
nano ~/Neon-Tester/backend/update-config.json
```

Edit the file — change all 3 values:
```json
{
  "latestVersion": "1.0.2",
  "versionCode": 3,
  "apkUrl": "https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.2.apk",
  "forceUpdate": false,
  "releaseNotes": "Describe what changed in this version."
}
```

Save the file:
- Press `Ctrl+O`
- Press `Enter`
- Press `Ctrl+X`

**Step 13 — Restart backend:**
```bash
pm2 restart neon-backend
```

**Step 14 — Verify everything:**
```bash
# Check APK is accessible (should return HTTP/2 200)
curl -I https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.2.apk

# Check update API returns new version
curl https://neontester.api.ionode.cloud/api/update/check
```

Expected output:
```
HTTP/2 200 ✅
{"latestVersion":"1.0.2","versionCode":3,...} ✅
```

✅ **Done! All installed apps will show the update popup on next open.**

---

## Quick Reference Cheat Sheet

### Backend-only change
```bash
# LOCAL
git add . && git commit -m "fix: ..." && git push origin main

# VPS
cd ~/Neon-Tester && git stash && git pull origin main && git stash pop
cd backend && npm install
pm2 restart neon-backend
```

### Frontend + APK change
```powershell
# LOCAL (PowerShell)
cd frontend
npm run build
npx cap sync android
# → Android Studio: Build Signed APK (release)
scp "...\app\release\app-release.apk" root@72.62.194.225:~/Neon-Tester/backend/uploads/apks/neon-tester-vX.X.X.apk
cd ..
git add . && git commit -m "feat: v1.0.X" && git push origin main
```

```bash
# VPS (SSH)
cd ~/Neon-Tester && git stash && git pull origin main && git stash pop
cd backend && npm install
nano ~/Neon-Tester/backend/update-config.json   # bump versionCode + apkUrl
pm2 restart neon-backend
curl -I https://neontester.api.ionode.cloud/downloads/neon-tester-vX.X.X.apk
```

---

## Version Tracking Table

> Update this table every time you release.

| Version | versionCode | Date | Type | What Changed |
|---|---|---|---|---|
| 1.0 | 1 | Jun 2026 | Initial | First release |
| 1.0.1 | 2 | Jun 2026 | Frontend + APK | OTA update system, Close button fix |
| | | | | |
| | | | | |

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `curl` returns `502` | Backend not running | `pm2 restart neon-backend` |
| `curl` returns `404` | APK not uploaded or wrong filename | Check `ls ~/Neon-Tester/backend/uploads/apks/` and verify filename matches `apkUrl` |
| `scp` fails with "No such file" | APK not built yet | Build in Android Studio first |
| `scp` fails with "connection closed" | Wrong hostname | Use IP `72.62.194.225` not hostname |
| Update popup not appearing on device | versionCode not incremented | Check `update-config.json` versionCode > app's versionCode |
| Install fails on device | Different signing key used | Use the same `C:\keys\neon-tester.jks` keystore |
| `git pull` fails with "unstaged changes" | VPS has local changes | `git stash` first, then `git pull`, then `git stash pop` |
| `pm2 logs` shows MongoDB error | DB connection issue | Check `backend/.env` MongoDB URI is correct |

---

## Emergency: Rollback to Previous Version

If a release breaks something and you need to go back:

```bash
# On VPS — edit config back to old version
nano ~/Neon-Tester/backend/update-config.json

# Set back to previous working version:
{
  "latestVersion": "1.0.1",
  "versionCode": 2,
  "apkUrl": "https://neontester.api.ionode.cloud/downloads/neon-tester-v1.0.1.apk",
  "forceUpdate": true,
  "releaseNotes": "Critical fix — please update."
}

pm2 restart neon-backend
```

> Setting `forceUpdate: true` forces all users to update immediately.
> The old APK `neon-tester-v1.0.1.apk` must still exist in the `uploads/apks/` folder.
> Keep all old APK files — never delete them — so rollback is always possible.

---

*Neon Tester — Ionode Cloud | VPS Update Guide*
