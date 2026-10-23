# Life OS

A calm personal app for your phone, built from five small parts:

- **Home**: today's habits (planned each Sunday, plus habits you're cutting back on, logged each time), a quick energy check-in, this week's priorities, who to reach out to, and decisions waiting on you.
- **Weekly review**: the same five questions every Sunday (what went well, what drained you, what you avoided, what matters next week, one thing to drop), plus a look back over months.
- **Decision journal**: write down what you decided, why, and what you expect. When the check-in date comes, it asks how it turned out.
- **People**: the 15–20 people who matter most, and a gentle nudge when it's been a while.
- **Energy log**: a few quick 1–5 check-ins a day with tags. After a week it shows what tends to go with better and harder days.

Everything you write stays on your phone. Nothing is sent anywhere. Use **Settings → Save a backup** now and then.

## Install on Android

### The app (APK), recommended

1. Download **life-os.apk** from the [latest release](https://github.com/Esbe-77/Life-os/releases/latest) on your phone.
2. Open it. If Android asks, allow your browser to install unknown apps, then tap **Install**.

To update, install the newer APK the same way. Your data stays. Uninstalling the app deletes its data, so save a backup first.

Every push builds the APK automatically (`.github/workflows/android.yml`). Pushes to `main` publish a numbered release, and pushes to other branches refresh the **preview** pre-release. Publishing needs two repository secrets, set once under **Settings → Secrets and variables → Actions**:

- `LIFEOS_KEYSTORE_BASE64`: the signing key, base64-encoded
- `LIFEOS_KEYSTORE_PASSWORD`: its password

Keep the key file somewhere safe. Every version must be signed with the same key, or Android won't install it as an update.

### Or as a web app

In **Settings → Pages**, deploy from the **main** branch, **/ (root)**. Then open <https://esbe-77.github.io/Life-os/> in Chrome and tap **⋮ → Add to Home screen**. (Some launchers don't support this, so the APK is the safer route.)

### Moving over from the Weekly Review web page

On the old page, tap **Download backup (.json)** under "Keep a copy". In Life OS, open **Settings → Restore from a backup** and pick that file.

## How it's built

Plain HTML, CSS and JavaScript modules. There's no build step and no dependencies, so it will keep working for years without upkeep. The Android app in `android/` is a small native shell: one WebView that serves these same files from inside the APK. See [CLAUDE.md](CLAUDE.md) for the structure and how to add a module.

To run it locally: `python3 -m http.server` in this folder, then open <http://localhost:8000>.
