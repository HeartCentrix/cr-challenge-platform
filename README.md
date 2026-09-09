# Challenge Platform - Frontend

The admin candidate table includes a Region column and US-state filter (50 states,
DC, Outside US, Unknown). It uses the latest submission IP within the selected dates,
not a verified home address. Region is included in the existing authenticated table/
overview requests, cache keys, paginated export requests, Excel data and filenames.
No per-candidate geolocation request is made by the browser. Backend migration
`10_candidate_regions.sql` and the matching backend must be deployed first.

The public challenge page, built from the supplied design
(`hardest-java-problem-v3.html`) and wired to the real API.

## Run it locally

Editor mass-input tracking records 80+ character edits or rapid, sparsely typed
bursts as review signals, not proof of console pasting. Changed editor state is
checkpointed every 30 seconds; final activity is sent with each answer. Idle pages send no
checkpoints. This uses backend migration `08_activity_checkpoints.sql`; deploy that
and the updated backend before this frontend. Admin details and day-scoped Excel
reports include checkpoint code, receipt times in the admin's local time zone, and
mass-input counts. No clipboard contents or personal-field input is monitored.

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

Challenge sessions choose random non-repeating problems; `?q=` no longer selects one.
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
- **One global ten-minute countdown** starts after details are entered and the candidate
  clicks Start. Submitting loads the next question immediately, without waiting for grading.
  The clock never resets between questions or on refresh; the backend enforces the deadline.
- **Submissions do not opt candidates into marketing contact.** The form has no contact
  consent checkbox and sends `consent: false`.
- **The leaderboard and ticker are live.** Both fall back silently to the design's static
  content if the API is unreachable, so the page never renders broken.
- **A Test Case runner was added** below the editor: pick an example input, run it, and compare
  your output against the expected one. Hidden test cases are never exposed.

Starting calls `/challenge-sessions/start` once and returns a complete random question.
Each `/answer` saves that answer and returns the next question in the same response.
Refreshing calls `/state` with a random capability stored in localStorage (not personal
details), restoring the current question and last saved draft. One session per day
replaces the one-answer daily limit. Questions do not repeat within a session.
Changed drafts autosave every five seconds; idle code makes no draft calls.
At expiry, the editor locks and the backend submits the latest nonblank draft received
before the deadline. Edits since the last successful save, including offline edits, cannot
be recovered; untouched starter code is not automatically submitted.
Deploy backend migration `09_global_challenge_sessions.sql` and the new backend before
this frontend. Session state and draft APIs are POST/no-store. No AWS changes happen
by building locally.

The candidate-facing leaderboard shows only first name plus surname initial (e.g. **Akshat V.**)
and rank. Full names remain internal. After the session ends, candidates
see the original badge-style modal with **Challenge submitted** and the time taken,
using the server session duration. Scores and grading details are never displayed.
The final modal shows the number of answers saved; the badge makes no ranking claim.
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
disposes its editor and cancels pending fetches/timers; the server deadline continues.
The countdown stops on session completion, not on individual answers.

Session/map regression tests: `node --test tests/*.test.js`.

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
