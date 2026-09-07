# Challenge Platform - Frontend

The public challenge page, built from the supplied design
(`hardest-java-problem-v3.html`) and wired to the real API.

## Run it

```bash
cd frontend
python -m http.server 4200      # or: npx serve -l 4200
```

Then open <http://localhost:4200/>. The backend must be running on port 8090
(`cd backend && mvn spring-boot:run`); it already allows CORS from localhost:4200.

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

This is plain HTML, CSS and JavaScript rather than Angular. The supplied design is a
single vanilla page, "keep it simple" was the brief, and there is no routing or shared
state to justify a build step yet. Nothing here blocks a later port: the API contract is
the only coupling, and `app.js` is organised as small functions per concern.
