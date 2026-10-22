# Life OS

A calm personal app for your phone, built from five small parts:

- **Home**: one page with today's habits, a quick energy check-in, this week's priorities, who to reach out to, and decisions waiting on you.
- **Weekly review**: the same five questions every Sunday (what went well, what drained you, what you avoided, what matters next week, one thing to drop), plus a look back over months.
- **Decision journal**: write down what you decided, why, and what you expect. When the check-in date comes, it asks how it turned out.
- **People**: the 15–20 people who matter most, and a gentle nudge when it's been a while.
- **Energy log**: a few quick 1–5 check-ins a day with tags. After a week it shows what tends to go with better and harder days.

Everything you write stays on your phone. Nothing is sent anywhere. Use **Settings → Save a backup** now and then.

## Install on Android

1. In this repo on GitHub, go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, pick **main** and **/ (root)**, and save. After a minute the app is live at <https://esbe-77.github.io/Life-os/>.
2. Open that link in **Chrome** on your phone.
3. Tap **⋮ → Add to Home screen** (or **Install app**).

It now opens from its own icon, full screen, and works offline. Updates arrive automatically: when this repo changes, the app picks up the new version the next time you open it (sometimes the time after).

### Moving over from the Weekly Review web page

On the old page, tap **Download backup (.json)** under "Keep a copy". In Life OS, open **Settings → Restore from a backup** and pick that file.

## How it's built

Plain HTML, CSS and JavaScript modules. There's no build step and no dependencies, so it will keep working for years without upkeep. See [CLAUDE.md](CLAUDE.md) for the structure and how to add a module.

To run it locally: `python3 -m http.server` in this folder, then open <http://localhost:8000>.
