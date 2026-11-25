# PRCH Team Tracker

Internal tracker for the PR Clubhouse team: tasks, minutes of meeting (MoM), client pipeline, collaterals and team members, with an overview dashboard.

It is a plain static website (HTML, CSS, JavaScript). No build step and no server needed.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Publish with GitHub Pages

1. Push this folder to a GitHub repository (files at the repo root).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose branch `main` and folder `/ (root)`, then **Save**.
4. After a minute the site is live at `https://<username>.github.io/<repo>/`.

## Where the data lives

Data is saved in each browser's **localStorage**. That means:

- Every person/device has its own copy; entries are not shared automatically.
- Clearing browser data deletes it.
- Use **Export data** to download a `.json` backup and **Import data** to load it on another device.

For one shared, live dataset for the whole team, replace the `store` object in `dash-shim.js` with a backend such as Firebase or Supabase. The rest of the app only talks to `claude.use('db')`, so nothing else needs to change.

> If the repository is public, do not commit exported backup files: they contain client names and deal values.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout, tabs and forms |
| `base.css` | Theme colours, fonts, light/dark mode |
| `style.css` | Tracker styles |
| `dash-shim.js` | Data layer (localStorage), redraw logic, export/import |
| `core.js` | Shared helpers, tables, boards, charts, KPI calculations |
| `draw.js` | Draws each section (KPIs, charts, boards, tables, team cards) |
| `mom.js` | Minutes of Meeting list and Word (.docx) export |
| `ui.js` | Tabs, view toggles and form handling |
| `vendor/d3.min.js` | D3 v7 charting library (ISC licence, see `vendor/d3-LICENSE`) |
| `logo.png` | PR Clubhouse logo |
