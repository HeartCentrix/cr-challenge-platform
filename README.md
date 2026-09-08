# Challenge Platform - Frontend

The public challenge page, built from the supplied design
(`hardest-java-problem-v3.html`) and wired to the real API.

## Run it locally

```bash
cd frontend
npm ci
npm start
```

Then open <http://localhost:4200/>. The default `local-dev` Angular environment calls the backend at
`http://localhost:8090/api/v1`, so run it with `cd backend && mvn spring-boot:run`.

## Environments

```bash
npm run build:local-dev # local API: http://localhost:8090/api/v1
npm run build:local   # dev API: https://challenge.dev.codereport.com/api/v1
npm run build:dev     # deployed API: same-origin /api/v1
npm run build:prod    # production API: same-origin /api/v1
```

Deployed bundles intentionally contain no AWS resource addresses or direct backend,
database, Judge0, or infrastructure URLs. CloudFront routes same-origin `/api/*` requests.

Use `npm run start:local` to run the frontend locally against the full dev API URL.
Use `npm start` or `npm run start:local-dev` to use the backend running on localhost.

Pick a specific problem with `?q=<slug>`, e.g. `?q=minimum-window-substring`.
Tag a campaign with `?c=<name>` and it is stored on the candidate record.

## Files

| File                    | Purpose                                                        |
|-------------------------|----------------------------------------------------------------|
| `index.html`            | The page. Generated from the design by surgical replacement, so the marquee, logo, timer, map, modal and footer are the originals |
| `styles.css`            | The design's stylesheet, verbatim                              |
| `app.css`               | Additions for the problem panel, real editor, Test Case runner and submission controls |
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
- **Submissions do not opt candidates into marketing contact.** The form has no contact
  consent checkbox and sends `consent: false`.
- **The leaderboard and ticker are live.** Both fall back silently to the design's static
  content if the API is unreachable, so the page never renders broken.
- **A Test Case runner was added** below the editor: pick an example input, run it, and compare
  your output against the expected one. Hidden test cases are never exposed.

The candidate-facing leaderboard shows only name and rank. After submitting, candidates
see the original badge-style modal with **Challenge submitted** and the time taken,
using the same duration saved with the submission. Scores and grading details are never displayed.
Every successful submission receives this confirmation; the badge makes no ranking claim.
The LinkedIn button downloads a PNG badge and opens LinkedIn sharing. Candidates attach
the image and publish the post themselves. Download and sharing links remain available
if the browser blocks the automatic action. Only the public challenge URL is shared,
never candidate contact information or internal service addresses.
The jobs button opens Code Report's contact form; it does not silently grant marketing consent.
The input selector labels the available examples as **Test Case**.

## Framework note

This is an Angular 20 standalone application. The supplied page and its visual behavior
remain intact as public assets while Angular owns application bootstrap and environment
selection, allowing features to migrate into Angular components incrementally.

# Local development environment

Run the Angular frontend against the backend at `http://localhost:8090/api/v1`:

```powershell
npm run start:local-dev
```

Create a local development build with:

```powershell
npm run build:local-dev
```
