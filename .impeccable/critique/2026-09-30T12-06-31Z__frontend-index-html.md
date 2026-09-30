---
target: GeneSense frontend
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
target_fingerprint: "sha256:92080e9a96af5f1128583b5971e665b28d36a2940259d17ae217eaa933a69da5"
target_path: "F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
timestamp: 2026-09-30T12-06-31Z
slug: frontend-index-html
---
## Design Health Score: 24/40 (Acceptable)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 2 | Latest record of any source sets Today; a simulated save turns a 186/122 emergency green |
| 2 | Real world match | 2 | "17 điểm sàng lọc" has no scale; "Đã ghi nhận" badge used to mean normal |
| 3 | User control | 3 | Esc/cancel fine; hash URLs do not route on load |
| 4 | Consistency | 2 | Four labels for "record reading"; "hồ sơ" means four things |
| 5 | Error prevention | 3 | Good min/max and consent gating; simulation shows "Đã ghi nhận" before save, saved values differ |
| 6 | Recognition | 3 | Chart silently filters to latest record's source |
| 7 | Flexibility | 3 | Partial manual entry is quick |
| 8 | Minimalist design | 1 | Gradients, blobs, flow diagram, eyebrows, repeated privacy copy, ~310 words on empty Today |
| 9 | Error recovery | 2 | Emergency has no 115 action; AI-off error shown only after opening upload |
| 10 | Help | 3 | Plenty of inline help, too much |

## Design Specificity Verdict
Generic AI-built SaaS health dashboard. Tells: v3 gradient layer (styles.css:17-63), animated integration-flow strip (index.html:111-117), uppercase tracked eyebrow over every heading (detector: 7 kicker-above-heading, 6 wide-tracking), icon-in-tinted-square per row, coach copy, badge on every card, card-in-card (detector: 2 nested-cards), thin-border wide-shadow dialogs (3), side-tab stripe (styles.css:6), hover-lift on non-interactive cards, 24 font sizes, ~9 near-identical grey-blues, 10 radii, 11 gradient elements.

## Priority Issues
- [P0] No true emergency state; latest reading of any source (incl. simulation) overrides it. Fix: pinned red emergency block with tel:115, hide score, simulation never sets Today status. harden, clarify.
- [P1] Decorative AI-look layer. Fix: delete v3 block, flow strip, hover transforms, view animations; flat surfaces, one solid blue, 1px borders. quieter/distill.
- [P1] Copy volume and coach tone. Fix: drop eyebrows, slogans, decorative icons; noun headings; privacy once at point of action; metric card = label/value/unit/status. clarify, distill.
- [P1] Today hierarchy: status ~500px down on mobile, 5 duplicate CTAs. Fix: status block first, one primary "Ghi chỉ số", readings as list. layout.
- [P2] Low-vision type and contrast: 65 low-contrast, 17 undersized, text down to 9.12px, primary button 4.0:1, disclaimer lightest text. Fix: 18px base / 16px min, 7:1 body, no negative tracking, 400/600 only. typeset, audit.

## Persona Red Flags
Jordan: OAuth admin error beside disabled Google button; demo path is a small link; 5 CTAs; unscaled score.
Sam: 9-12px text, #8e9bad disclaimer, ambient animations, canvas chart without text alternative.
Casey: status below fold, ~1900px scroll, history rows wrap, 3 tap targets under 44px.
Bác Hùng (62): reads "Cần kiểm tra sớm" at 186/122 as "someday"; onboarding step 3 is a wall; jargon (SpO₂, bpm, Gemini).

## Minor Observations
Hash routing, chart source filter (app.js:246-247), index-assigned tip icons (app.js:220), empty dashed sparklines (app.js:202), fake breadcrumb and "Hồ sơ riêng tư" chip, profile omits height, feedback card on History, broken-image placeholder, line length ~121ch.

## Questions to Consider
- If the score disappeared and only "Bình thường / Cần chú ý / Nguy hiểm – gọi 115" remained, what would users lose?
- Is the Phả hệ → Sinh hiệu → AI strip for patients or judges?
- Should simulated data touch real status and history at all?
