# Challenge Platform - Frontend

The public challenge page, built from the supplied design
(`hardest-java-problem-v3.html`) and wired to the real API.

## Run it locally

```bash
cd frontend
npm ci
npm start
```

Then open <http://localhost:4200/>. The local Angular environment calls the backend at
`http://localhost:8090/api/v1`, so run it with `cd backend && mvn spring-boot:run`.

## Environments

```bash
npm run build:local   # local API: http://localhost:8090/api/v1
npm run build:dev     # deployed API: same-origin /api/v1
npm run build:prod    # production API: same-origin /api/v1
```

Deployed bundles intentionally contain no AWS resource addresses or direct backend,
database, Judge0, or infrastructure URLs. CloudFront routes same-origin `/api/*` requests.

Pick a specific problem with `?q=<slug>`, e.g. `?q=minimum-window-substring`.
Tag a campaign with `?c=<name>` and it is stored on the candidate record.

## Files

| File                    | Purpose                                                        |
|-------------------------|----------------------------------------------------------------|
| `index.html`            | The page. Generated from the design by surgical replacement, so the marquee, logo, timer, map, modal and footer are the originals |
| `styles.css`            | The design's stylesheet, verbatim                              |
| `app.css`               | Additions for the parts the mockup did not have: problem panel, real editor, sample runner, consent row |
| `app.js`                | All live behaviour: question loading, editor, countdown, run, submit, leaderboard, ticker |
| `map.js`                | The US activity map, lifted unchanged. Decorative - the dot grid comes from state boundaries, not live geo data |
| `design-reference.html` | The original mockup, untouched, for visual comparison          |

## What changed from the mockup, and why

- **The editor is real.** The mockup showed seven hard-coded lines of syntax-highlighted
  HTML. It is now Monaco, loaded from CDN, seeded with the question's starter code and
  themed to the design's palette. `insertSpaces: true` is deliberate: a submission that
  mixes tabs and spaces fails to compile, which is a real failure mode that has already
  zeroed live candidates on the evaluation platform.
- **The countdown starts on the first keystroke,** as the mockup's own comment said it
  should in production. It runs from the question's `timeLimitSeconds`, not a fixed 8:00.
  At zero the editor locks and the page invites a submission.
- **A consent checkbox was added** to the lead form. The API rejects a submission without
  it, and collecting contact details for follow-up without consent is not defensible.
- **The leaderboard and ticker are live.** Both fall back silently to the design's static
  content if the API is unreachable, so the page never renders broken.
- **A sample runner was added** below the editor: pick a sample input, run it, and compare
  your output against the expected one. Hidden test cases are never exposed.

## Framework note

This is an Angular 20 standalone application. The supplied page and its visual behavior
remain intact as public assets while Angular owns application bootstrap and environment
selection, allowing features to migrate into Angular components incrementally.
