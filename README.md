# QuantStudy

QuantStudy is a responsive, browser-based workspace for quantitative interview practice. It brings a searchable question library, course reader, and personal progress dashboard into one interface. This project highlights front-end implementation: data-driven rendering in vanilla JavaScript, responsive CSS, search and filtering, hash-based deep links, interactive study controls, and browser persistence.

## Run locally

Requires Python 3. No package install or build step is needed.

```bash
python serve_app.py
```

Open **http://localhost:4173**. The server also saves progress snapshots to a local SQLite database. To view only the static front end, use any local static file server; browser storage still works without the SQLite endpoint.

## What to explore

- **Dashboard:** question counts, completion by topic, favorites, and recent practice.
- **Question library:** live search and filters for source, topic, and difficulty.
- **Question types and tags:** browse by concept, firm, or review status.
- **Study view:** answer entry, numeric checking where a reliable key exists, notes, favorites, and self ratings.
- **Courses:** responsive lesson navigation and rendered mathematical content.
- **Progress:** attempts, accuracy, confidence ratings, and topic coverage.

Progress is stored in `localStorage` and IndexedDB. The optional Python server backs it up to SQLite on the same machine. No account is required.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | App shell and metadata |
| `styles.css` | Responsive layout, components, and visual design |
| `app.js` | Views, filtering, interactions, routing, and persistence |
| `content.js`, `courses.js` | Data consumed by the front end |
| `serve_app.py`, `backup_progress.py` | Optional local server and SQLite backup |

## Implementation notes

The interface is framework-free so the rendering and state management are visible in the code. URLs use hash parameters for direct links to questions and lessons. Text inserted into UI templates is HTML-escaped; preformatted lesson and prompt HTML comes from the project data files. On smaller screens, the sidebar condenses and content grids become single-column.

The QuantGuide questions and Quantable lessons are third-party study material, included for educational demonstration. The front-end application and its UI code are the focus of this portfolio project; the source content is not presented as original work.
