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

## Data and access

Data is stored in **Firebase Firestore** (project `prchdashboard`) and syncs live across every device.

- Everyone signs in with **Google**.
- The owner/admin is set in `firebase-config.js` (`admin`) and in `firestore.rules` (`isOwner()`).
- People without access can **request access** after signing in. Admins accept or reject requests, add members directly and change roles under **Team → Access & members**.
- Roles: **Admin** (manage access), **PRCH team**, **Partner** (shown as "Name (Agency)").
- Every change is stamped "Changes made by …" and listed under **Recent changes**.

### Security rules

- `firestore.rules` → Firebase console → Firestore Database → Rules → **Publish**
- `storage.rules` → Firebase console → Storage → Rules → **Publish** (file uploads in Collaterals; needs the Blaze plan)

### Backup

**Export data** downloads a JSON backup; **Import data** writes a backup into Firestore. Do not commit backup files to a public repo.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout, tabs and forms |
| `base.css` | Theme colours, fonts, light/dark mode |
| `style.css` | Tracker styles |
| `firebase-config.js` | Firebase project config and admin email |
| `fb.js` | Loads the Firebase SDK |
| `dash-shim.js` | Data layer (Firestore), sign-in and access, redraw logic, export/import |
| `firestore.rules` | Database security rules to paste into Firebase |
| `storage.rules` | File upload security rules to paste into Firebase |
| `core.js` | Shared helpers, tables, boards, charts, KPI calculations |
| `draw.js` | Draws each section (KPIs, charts, boards, tables, team cards) |
| `mom.js` | Minutes of Meeting list and Word (.docx) export |
| `ui.js` | Tabs, view toggles and form handling |
| `vendor/d3.min.js` | D3 v7 charting library (ISC licence, see `vendor/d3-LICENSE`) |
| `logo.png` | PR Clubhouse logo |
