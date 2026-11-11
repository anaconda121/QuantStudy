# QuantStudy

QuantStudy is a static, responsive website for quantitative interview practice. It brings a searchable question library, course reader, and personal progress dashboard into one interface. This project highlights front-end implementation: data-driven rendering in vanilla JavaScript, responsive CSS, search and filtering, hash-based deep links, and interactive study controls.

## Run locally

No database, backend, package install, or build step is needed. Open `index.html` directly, or serve the folder with any static file server. For example, with Python 3:

```bash
python -m http.server 4173
```

Open **http://localhost:4173**. The same files can be hosted on GitHub Pages.

## What to explore

- **Dashboard:** question counts, completion by topic, favorites, and recent practice.
- **Question library:** live search and filters for source, topic, and difficulty.
- **Question types and tags:** browse by concept, firm, or review status.
- **Study view:** answer entry, numeric checking where a reliable key exists, notes, favorites, and self ratings.
- **Courses:** responsive lesson navigation and rendered mathematical content.
- **Progress:** attempts, accuracy, confidence ratings, and topic coverage.

Progress is stored only in the visitor's browser using `localStorage`. No account or server storage is involved.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | App shell and metadata |
| `styles.css` | Responsive layout, components, and visual design |
| `app.js` | Views, filtering, interactions, routing, and persistence |
| `content.js`, `courses.js` | Data consumed by the front end |

## Implementation notes

The interface is framework-free so the rendering and state management are visible in the code. URLs use hash parameters for direct links to questions and lessons. Text inserted into UI templates is HTML-escaped; preformatted lesson and prompt HTML comes from the project data files. On smaller screens, the sidebar condenses and content grids become single-column.

The QuantGuide questions and Quantable lessons are third-party study material, included for educational demonstration. The front-end application and its UI code are the focus of this portfolio project; the source content is not presented as original work.
