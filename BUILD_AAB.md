# LegalBridge Android AAB — Build Guide

## Prerequisites (install once)

### 1. Java 17 (JDK)
Download from https://adoptium.net/ — choose **Temurin 17 LTS**, Windows x64 Installer.

After installing, verify:
```
java -version
# should print: openjdk version "17..."
```

### 2. Android Studio + SDK
Download from https://developer.android.com/studio — install with default settings.

After installing:
- Open Android Studio → More Actions → SDK Manager
- SDK Platforms tab → tick **Android 14 (API 34)**
- SDK Tools tab → tick **Android SDK Build-Tools 34**, **Android SDK Platform-Tools**
- Click Apply → OK

Set environment variables (add to Windows user Environment Variables):
```
ANDROID_HOME = C:\Users\<you>\AppData\Local\Android\Sdk
```
Add to PATH:
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\build-tools\34.0.0
```

---

## First-time setup (run once)

### Step 1 — Create the release keystore
Run in PowerShell from the project root:
```powershell
cd android
keytool -genkey -v `
  -keystore release.keystore `
  -alias legalbridge `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -dname "CN=LegalBridge, OU=DST Global Innovative Nigeria Ltd, O=DST Global, L=Akwanga, S=Nasarawa, C=NG"
```
It will prompt for a keystore password and a key password. **Save both passwords** — you will need them every time you build and to sign future updates. If you lose the keystore you can never update the Play Store app.

### Step 2 — Create keystore.properties
In the `android/` folder, create a file called `keystore.properties` (this file is git-ignored):
```
storeFile=release.keystore
storePassword=<your store password>
keyAlias=legalbridge
keyPassword=<your key password>
```

---

## Build the AAB (every release)

From the project root:
```powershell
# Sync Capacitor (copies config into Android project)
npx cap sync android

# Build the release AAB
cd android
.\gradlew bundleRelease
```

The AAB is output to:
```
android\app\build\outputs\bundle\release\app-release.aab
```

---

## Submit to Google Play

1. Go to https://play.google.com/console
2. Create a new app → App name: **LegalBridge** → Default language: English → App / Game: App → Free or Paid
3. Complete the store listing:
   - Short description (≤80 chars): *Nigerian legal AI — draft documents, get advice*
   - Full description: copy from legalbridge.ng
   - App category: **Productivity** or **Business**
   - Upload screenshots (at least 2 phone screenshots from legalbridge.ng on mobile)
   - Feature graphic: 1024×500 PNG (LegalBridge banner)
   - App icon: 512×512 PNG (your existing app icon)
4. Go to **Production → Create new release**
5. Upload `app-release.aab`
6. Release name: **1.0.0** | Release notes: *Initial release of LegalBridge AI for Android*
7. Submit for review (takes 1–3 days for new apps)

---

## App details reference

| Field | Value |
|---|---|
| Package name | `ng.legalbridge.app` |
| App name | LegalBridge |
| Version | 1.0.0 (versionCode 1) |
| Min Android | API 22 (Android 5.1) |
| Target Android | API 34 (Android 14) |
| Web app URL | https://legalbridge.ng/chat.html |
| Architecture | Capacitor WebView wrapper (live URL — no local bundle) |

---

## Updating the app

For web-only changes (new features, bug fixes): **no new Play Store release needed** — the WebView loads legalbridge.ng live.

For native changes (new permissions, plugin upgrades, icon changes):
1. Bump `versionCode` and `versionName` in `android/app/build.gradle`
2. Run `npx cap sync android` then `.\gradlew bundleRelease`
3. Upload the new AAB to Play Console as a new release.
