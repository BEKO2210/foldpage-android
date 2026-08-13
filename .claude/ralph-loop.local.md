---
active: true
iteration: 14
session_id: c6b0ecee-85c6-432f-bd93-b267b8c403c4
max_iterations: 20
completion_promise: "FOLDPAGE_20_RUNS_COMPLETE"
started_at: "2026-08-12T22:16:23Z"
---

Improve FoldPage through a disciplined iterative product-design and engineering loop.

Use the frontend-design skill, the foldpage-product-ux project skill and Playwright.

MISSION

Transform the existing FoldPage UI into an exceptionally polished, simple consumer
application. Do not redesign blindly.

FIRST (iteration 1 only): inspect the entire repository, understand the current
architecture, run the existing application, establish a functional baseline, inspect
the live UI with Playwright, capture desktop and mobile screenshots, identify existing
flows, identify existing tests/build/lint commands, record current console errors,
record existing responsive problems. Write the baseline to docs/UI-BASELINE.md.

PRODUCT PRINCIPLE

The normal user must NEVER need to understand TTS engines, providers, inference
frameworks, model names or backend routing. FoldPage decides these automatically.

The visible generation workflow converges toward: TEXT → LANGUAGE → VOICE → GENERATE.

LANGUAGE SYSTEM

Design FoldPage for broad multilingual support. When German is selected, show only
German-compatible voices; when Italian is selected, only Italian-compatible ones, and
equivalently for every supported language. Never one giant global voice list.

The architecture supports downloadable language/voice packs. Preferred experience:
select language → compatible installed voices appear immediately. If assets are
missing: FoldPage offers an integrated download, shows size and progress, installs it,
the voice becomes available, and thereafter works locally/offline where technically
possible. Do not require another consumer application.

Internally multiple engines are allowed and encouraged when useful. The routing layer
chooses the best compatible implementation automatically.

20-ITERATION STRATEGY

No random redesigns. Each iteration: (1) inspect the current state, (2) identify the
highest-impact remaining weakness, (3) formulate a measurable hypothesis, (4) implement
a focused improvement, (5) run build/lint/tests, (6) open the real interface with
Playwright, (7) test relevant interactions, (8) inspect desktop, (9) inspect mobile,
(10) check the browser console, (11) check overflow/layout, (12) compare against the
previous state, (13) keep the change only when it is an actual improvement, (14) record
what changed and what remains in docs/UI-BASELINE.md.

Across the 20 iterations cover: information architecture, main generation flow,
language selector, language search, voice filtering, voice previews, downloadable voice
packs, download progress/error/retry states, offline state, typography, spacing, visual
hierarchy, navigation, mobile ergonomics, accessibility, keyboard operation, focus
states, microinteractions, loading states, empty/error states, performance, unnecessary
rerenders, asset loading, perceived latency, removal of technical/developer
terminology, simplification, final visual consistency.

Do not change something merely to create another iteration. Later iterations become
increasingly strict audits and refinements if the product is already strong. Never
sacrifice functionality, accessibility, performance or maintainability for visual
decoration. Do not stop after producing recommendations — actually modify the
application.

At completion run the complete validation suite and perform a final Playwright product
audit on desktop and mobile. Only declare completion when the resulting application is
materially better than the baseline and no known high-severity regression remains.

When everything is finished output exactly: FOLDPAGE_20_RUNS_COMPLETE
