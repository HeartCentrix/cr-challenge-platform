# Challenge editor activity

Native page text selection is disabled. Monaco's custom selections are collapsed to
a single caret, including mouse drags, keyboard selection and additional cursors;
ordinary cursor movement and typing remain available. Copy, cut, paste and drag/drop are blocked
for the question/prompt, public test-case output and coding editor throughout the challenge page's lifetime,
including OS shortcuts and beforeinput. The editor context menu is disabled.
Blocked clipboard attempts are recorded without reading clipboard contents. Personal-detail inputs,
admin screens and sign-in fields keep normal clipboard behaviour and are excluded
from candidate activity tracking.

The page keeps a clipboard guard after question tracking ends, including on completion
and reset. Copy events targeting the document are also blocked when the editor is focused
or its contents are selected. Only an active question records activity counters.

The page asks candidates to type their answers. Grading weights have not changed.
Clipboard attempts do not set the
`AI-used` flag: that flag requires the exact hidden marker in saved submitted code.
Past observed clipboard events remain supported in saved reports. Monaco paste
callbacks are still recorded if a paste bypasses the browser event blockers.

The report is sent once with `/submit`, not once per key, and stored on the saved attempt.
It contains separate question/answer clipboard-attempt counters, keydown categories and
monotonic offsets, trusted/synthetic event observations, inserted/deleted character counts,
Monaco model changes and observed paste operations. No literal keys, clipboard contents,
or input outside the editor is collected. It is not a replay of source-code edits.
The starter code is excluded. Reports are kept in page memory until submission; navigating
away or reloading discards unsubmitted activity. Submission failure retains activity for retry.
The first 5,000 events are retained; aggregate counters continue afterwards and the report
records how many additional timeline events were omitted.

Admin candidate details show per-attempt counters and the first 100 retained events.
The selected-day Excel report includes all retained events with the local zone and offsets.
Old/missing telemetry is labelled "Not recorded", never zero or "clean".

## Limits and review

This is unverified, client-reported telemetry, not a security boundary. DevTools can remove
listeners, change scripts, read the prompt/model/clipboard without events, forge reports or
submit directly. Browser `isTrusted` distinguishes ordinary synthetic events, but cannot
authenticate the final API payload. Model changes without recent trusted input are labelled
unexplained, not paste or cheating: formatting, completions, IME and assistive technology can
also produce them. No automated rejection or score adjustment is based on these signals.
Use them only as contextual evidence for human review.

Deploy the backend migration `db/07_editor_activity.sql` and updated backend before publishing
the frontend. Until then the AWS site is unchanged. Reports follow the attempt's retention:
deleting the attempt also removes its telemetry. Administrators should handle Excel files as
confidential candidate data.
