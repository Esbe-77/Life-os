# Life OS: notes for working on this repo

A personal, offline-first web app installed on Android from GitHub Pages. The owner wants it to stay **simple, calm, and never feel like a chore**. Prefer fewer taps and fewer features over more.

## Rules

- No build step, no frameworks, no npm dependencies. Plain ES modules served as static files.
- All data stays on the device. Never add a server, analytics, or network calls (Google Fonts is the only external request, and it's optional).
- Never break existing saved data. If a module's data shape changes, migrate it on load in that module, and keep `importData` accepting older backups.
- Use relative paths everywhere (the site is served from `/Life-os/`).
- When you add, rename or remove a file, update `APP_FILES` in `sw.js` and bump `VERSION`.
- Test at phone width (390px) in light and dark mode.

## Structure

```
index.html            shell: page heading, sub-tabs, view, bottom tab bar
css/app.css           all styles; colour tokens at the top (light + dark)
js/app.js             router (#/<moduleId>/<view>), tab bar, settings page
js/store.js           on-device storage: one JSON document per module in localStorage ("lifeos.v1.<id>")
js/backup.js          one backup file for everything; restore; share/download
js/ui.js              el() DOM helper, date/time pickers, hold-and-drag sortable(), date helpers ("YYYY-MM-DD" local dates)
js/habits.js          habits on Home: weekly plans (Sunday planner, and a day-by-day Week page to re-plan mid-week), habits to break (logged times), reminders, timers, their pages
js/reminders.js       builds the phone's reminder list (habits, Sunday review, decision check-ins) and sends it to the app
js/modules/index.js   module list, in tab-bar order
js/modules/*.js       home (dashboard + habits), goals (steps, linked habits), mind (things on your mind), weekly-review, decisions, people, energy (no longer a tab; kept for old data)
sw.js                 offline cache (web install only; the Android app skips it)
android/              native shell: one WebView serving the web files from the APK (copied in at build time)
.github/workflows/    builds the APK on every push and publishes it as a GitHub release
```

## Android app

- The page is served at `https://appassets.androidplatform.net/assets/www/`. Never change that address or the `applicationId`: the saved data is tied to both.
- `window.LifeOSAndroid` exists only inside the app. It provides `saveFile(name, text, mime)`, which reports back through `window.__lifeosSaveResult`, plus `version()`, `setReminders(json)`, `startTimer(id, seconds, title, text)`, `cancelTimer(id)`, `requestNotifications()` and `takeDone()`.
- Habit reminders have a Done button and the Sunday review reminder a Complete button (both `DoneReceiver`; Complete marks that week's review done, keeping any answers). Each Done tap posts a short notification ("2 of 3", or "complete" on the last go; its sound is the chime); in the app, `ding()` in ui.js plays one for each go. Taps are queued natively and collected by the page with `takeDone()` at start and on resume (`window.__lifeosResume`).
- Reminders: the page always sends the whole list (`js/reminders.js`) after any save. `Reminders.java` books only the next time of each with AlarmManager and books the following one when it fires. `BootReceiver` books them again after a restart or an update.
- File pickers (`<input type=file>`) work through `onShowFileChooser` in `MainActivity`.
- Releases must be signed with the same key (the repo secrets), or updates won't install over the old version.

## Module shape

```js
export default {
  id: "people",             // route and storage key
  name: "People",           // page heading
  tab: "People",            // tab-bar label
  icon: "people",           // key in ICONS in app.js
  color: "var(--m-people)", // module hue
  views: [["", "List"], ["x", "Other"]], // optional sub-tabs
  title(view), subtitle(view), backTo(view), // optional heading helpers
  badge(),                  // optional number on the tab (use sparingly)
  hasData(),                // for the backup reminder
  exportData(),             // plain JSON for the backup file
  importData(data),         // merge a backup in; return { added, kept, noun: [one, many] } or { error }
  mount(root, { view, navigate, refreshChrome }) // render; return { setView(view), unmount() }
};
```

Merging on restore: entries are matched by id and the most recently edited one wins. Restoring never deletes anything.
