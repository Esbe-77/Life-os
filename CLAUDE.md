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
js/ui.js              el() DOM helper, date helpers ("YYYY-MM-DD" local dates)
js/modules/index.js   module list, in tab-bar order
js/modules/*.js       home (dashboard + habits), weekly-review, decisions, people, energy
sw.js                 offline cache
```

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
