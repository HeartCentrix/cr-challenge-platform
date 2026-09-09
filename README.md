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

Normal page loads fetch one complete randomly selected active question in a single API request, including its prompt, starter code, and sample test cases. No question-list or follow-up detail request is needed.
Shared `?q=slug` links load that active question directly; missing/inactive questions fall back to a random one.
Random selection may repeat a question on subsequent loads; the daily submission limit is unchanged.

The candidate-facing leaderboard shows only first name plus surname initial (e.g. **Akshat V.**)
and rank. Full names remain internal. After submitting, candidates
see the original badge-style modal with **Challenge submitted** and the time taken,
using the same duration saved with the submission. Scores and grading details are never displayed.
Every successful submission receives this confirmation; the badge makes no ranking claim.
The LinkedIn button downloads a PNG badge and opens LinkedIn sharing. Candidates attach
the image and publish the post themselves. Download and sharing links remain available
if the browser blocks the automatic action. Only the public challenge URL is shared,
never candidate contact information or internal service addresses.
The ticket button reads **Get your free ticket for Code for Cash 2026 here!**.
It is disabled and has no destination until further notice.
It does not silently grant marketing consent.
The input selector labels the available examples as **Test Case**.

## Framework note

This is an Angular 20 standalone application. The challenge template is a lazy-loaded
Angular component at `/`; admin login and reset pages have separate lazy routes.
The map, Monaco loader, and challenge behavior scripts load only when the challenge
route opens. Badge capture loads on demand when sharing. Leaving the challenge
disposes its editor, cancels pending fetches, and stops the countdown; the countdown
also stops on timeout or successful submission. The supplied visual design is preserved.

# Local development environment

Run the Angular frontend against the backend at `http://localhost:8090/api/v1`:

```powershell
npm run start:local-dev
```

Create a local development build with:

```powershell
npm run build:local-dev
```

## Admin daily-limit reset

Open `http://localhost:4200/reset-admin-aria` while running `npm run start:local-dev`.
You are redirected to `/reset-admin-aria/login` to sign in with the seeded admin
account. After login, choose **One email** or **Multiple emails**, enter candidate
email addresses, confirm the reset, then submit. **Sign out** revokes the session.
Multiple mode accepts newlines, commas or semicolons, up to 100 emails. Passwords
are cleared after login and never persisted. A 30-minute opaque session token is
kept in session storage so the current tab survives refresh; the backend validates
it before allowing entry or a reset. The page shows a result for each
distinct normalized email. Existing submissions and scores are not deleted.

Admin accounts and audit history live in the backend's separate
`challenge_platform_admin` schema; see the backend README for local SQL setup.
No admin link is added to the candidate-facing page. The backend authenticates
the operation independently of the page URL. The selected Angular environment
determines which backend is affected; use `local-dev` for the local seeded account.

## Admin candidate statistics

Open `http://localhost:4200/stats-admin`. Sign in at `/stats-admin/login` with an
existing admin account. The separate developer-only reset URL is
`/reset-admin-aria`; it is not linked or mentioned in the stats/sign-in UI.

The dashboard uses the challenge's dark theme by default, with a persistent
light/dark preference and the original TSP CodeReport logos. The sign-in page
uses TSP's split layout and illustration.

Statistics aggregate **all submissions**, not just the latest attempt. Without
dates, the full history is included. A single custom calendar selects an inclusive
date range in the browser's local time zone. Search, an exact case-insensitive
campaign tag, and minimum/maximum overall pass percentage filter the table,
totals and chart. Campaign is the candidate's acquisition label: `?c=linkedin`
is recorded when the candidate is created; untagged submissions use `direct`.

Total score sums submission scores; average score is the arithmetic mean per
submission. The headline average is the mean of those candidate averages.
Overall pass rate divides all passed test cases by all test cases in the selected
submissions, rather than averaging attempt percentages. Zero denominators have
a separate group. Repeated attempts at the same question all contribute.

The right-hand breakdown supports pie (default), doughnut, bar and line charts.
Click a segment or legend item to filter candidates. Drag its left edge to expand
above a blurred/glassy table backdrop; drag narrower than its default 320px width
to collapse it smoothly. The table then fills the space. The slim edge handle
reopens the panel; keyboard arrows also resize it (Home restores default width).
The candidate table has sticky headers and cursor-based infinite loading in
batches of 25. Requests stop at the final batch, including empty results.

Authenticated GET results use an in-memory client cache with a one-hour maximum
TTL and timed deletion. Concurrent identical requests are deduplicated; returning
to a cached view does not repeat its data requests. Logout/session expiry clears
the cache sooner; a page reload starts with an empty cache. No candidate data is
written to local/session storage. Cache size is capped at 100 responses / about
10 MB. The existing 30-minute admin session is unchanged. Authentication checks
are never cached. A shared filter snapshot keeps candidate pagination consistent.

Click anywhere on a row (or press Enter) to open `/stats-admin/candidates/:id`.
The detail page includes contact details, campaign, consent, lifetime aggregates,
submission history (10 per page), saved code, score, timing and test-case outcomes.
An attempt's full details load on demand. Question text, inputs and expected
outputs reflect the current question bank, which is not versioned; saved code,
scores and execution outcomes belong to the selected attempt.

### Admin exports

`Export Excel` downloads all candidates matching the currently applied table filters
(search, campaign, dates, pass percentage and chart bucket), in the table's order.
It reuses loaded rows, preserves the table snapshot, and fetches only remaining
cursor batches on demand. No further candidate request is made for a completed
list. The workbook includes all displayed candidate/contact/performance fields, with
browser-local submission/export timestamps and explicit time zone/UTC offsets.
Candidate-controlled values are stored as literal text, never formulas. The Candidates
sheet has alternating row shading, frozen headers, filters, numeric scores/percentages,
readable column widths and elapsed-time formatting. Export Details lists every applied filter.
The Excel filename identifies the applied search, campaign, date, percentage and
chart-group filters (or `all-candidates` when unfiltered). Long/unsafe filter text
is shortened/sanitized for filenames.

`Export Excel report` on a candidate detail page downloads a real `.xlsx` workbook
with five styled sheets: Candidate Overview, Submissions, Code and Questions,
Test Results, and Test Case Content. It includes aggregates and every
submission for the selected day, saved code, question/reference content, metadata and public/hidden results.
Its filename includes the candidate's sanitized name and selected date, falling back
to their ID when no usable name is recorded. A compact single-day calendar beneath
its trigger selects the report day (today by default). History, totals and export
use the same day/time-zone/snapshot parameters; empty days cannot be exported.
Changing the day cancels an active export and resets history pagination. Export
validation also rejects any submission outside that local day.
Candidate totals appear only in Overview; each attempt has one Submissions row,
including attempts without saved case results. Headers are frozen and filterable;
scores/percentages are numeric and editable. Code/output uses wrapped monospace
cells, split into numbered parts before Excel's cell-length limit without truncation.
Candidate-controlled content is literal text, never a formula. ExcelJS is loaded
on demand only for Excel exports, not on the public challenge page.

Admin statistics and detail pages display browser-local timestamps (24-hour clock)
and label the IANA time zone. Offsets are calculated for each timestamp, including
historical daylight saving. Excel dates contain local wall-clock values with
separate UTC offsets and a zone label on every sheet; durations use `[h]:mm:ss`.
The Excel filename uses the local export date. Backend storage and candidate-facing
timestamps are unchanged. Excel has no native time-zone-aware date type, so keep
the accompanying time-zone/offset labels when sharing or interpreting exports.

Dependency audit: ExcelJS 4.4.0 currently brings a moderate UUID advisory affecting
v3/v5/v6 buffer handling. Its source uses UUID v4 only, and this export does not use
those affected functions. Do not run an automatic major-version downgrade to clear
the advisory; recheck on the next ExcelJS upgrade.

Both exports show progress and allow cancellation. Navigation (or changing table
filters) cancels an in-progress export. Failed/incomplete exports do not download
partial files. Exports use the existing authenticated APIs/cache; no public
endpoint is added. Downloaded files contain confidential data and remain on the
admin's device independently of the one-hour in-app cache.

The date-range calendar is a compact non-modal popover beneath its trigger,
without a screen overlay or blur. Clicking outside or pressing Escape dismisses
it without applying draft dates; Apply range commits both selected dates.
