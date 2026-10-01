---
target: "Di truyền tab (frontend/index.html #genetics-view)"
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
target_fingerprint: "sha256:26309e4f9a025df512fbfe48ae8094cd633de636ec6d5f474352db8a9d6a5a68"
target_path: "F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
timestamp: 2026-10-01T06-01-44Z
slug: frontend-index-html
---
Method: dual-agent (A: a160a415c91f9a85f · B: ab30cdb74204a5307)

# Critique: "Di truyền" tab (branch feat/family-risk, commit b7beea6)

Scope: the family-history risk tab only (`#genetics-view`, `renderGenetics()`, `.risk-*` styles), inspected live at 1100x900 and 375x812 on a rich-history account and an all-unknown account.

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No loading state: before the first fetch finishes the tab shows the failure panel "Chưa tải được mức nguy cơ" (read from code, not seen live). Nothing in the view is announced to screen readers. |
| 2 | Match with the real world | 3 | Plain kinship words. But "Trung bình" reads as "normal" while it sits under "Bệnh cần lưu ý", and the tab is named "Di truyền" while its footer says it is not a gene result. |
| 3 | User control and freedom | 3 | The edit form's exit says "Về hồ sơ" but returns to Di truyền. |
| 4 | Consistency and standards | 2 | Red octagon means "Nguy hiểm" on Hôm nay and "Rất cao" here. The "Trung bình" dot is the same shape Hôm nay uses for safe. |
| 5 | Error prevention | 2 | The all-unknown account shows "Rất cao 0 bệnh / Cao 0 bệnh / Trung bình 0 bệnh", which reads as an all-clear. |
| 6 | Recognition over recall | 3 | The key "Cách đọc mức nguy cơ" sits about 3.5 screens down on a phone, far from the levels it explains. |
| 7 | Flexibility and efficiency | 2 | No path from a card to editing that relative. The link from Hôm nay is inside a closed "Cách tính kết quả". |
| 8 | Aesthetic and minimalist | 3 | Restrained. But three different counts describe one thing: lead says 2, tiles say 1/1/3, section shows 5 cards. Phone page is 4792px tall. |
| 9 | Error recovery | 2 | Retry panel is a bare heading and a button, with no cause and no reassurance. |
| 10 | Help and documentation | 3 | Key and disclaimer are well worded but both sit at the very bottom. |
| **Total** | | **25/40** | **Acceptable** |

## Design specificity verdict

**Design review:** authored for this product, not interchangeable. Cards name the relatives behind each level, the key is written in kinship terms, and the "Bên nội / Bên ngoại" tree is specific to a Vietnamese family. It holds the restrained government-app look. It stops being authored in two places: "Rất cao" borrows the emergency styling wholesale, and the unknown state is the full layout with zeros in it.

**Deterministic scan:** `impeccable detect --json frontend/index.html` exited 2 with 3 findings, none inside this tab and all false positives against the product rules: `broken-image` (`#document-preview`, src set by JS), `cramped-padding` (`.measurement-tabs` segmented control), `dark-glow` (`.chart-tip`, `dialog` neutral elevation shadow).

**In-page overlay:** injection succeeded on the rich account; 9 findings. 5 x `side-tab` on the coloured card and tile edges (false positive: health-status signal paired with word and meter). 2 x `line-length` inside the tab at about 92 characters per line on desktop (borderline). 1 x `line-length` on the page footer (outside the tab). 1 x `flat-type-hierarchy` (mostly forced by the 16px floor, but it exposed card h3 at 23.9px rendering larger than section h2 at 22px).

## Overall impression

The content is right and honest; the order and the colour are wrong. The page opens on a scoreboard with a red "Rất cao" and ends on a disclaimer, so the person meets the alarm first and the reassurance last. The biggest single win is to keep red for emergencies and move the reassuring sentence to the top.

## What's working

- Evidence beside the verdict: "Người thân mắc bệnh" labels under each level let the person check the rule themselves.
- Level never depends on colour: word, shape and meter all carry it. Level words measure 7.2:1 to 8.9:1 on white; no text under 16px at either width.
- Honest unknown: "Chưa đủ thông tin" and "Chưa ghi nhận" are separate states, and advice is phrased as questions for a doctor.

## Priority issues

**[P1] "Rất cao" is the emergency signal.** Red means "call 115 now" on Hôm nay and "a fact about your family you cannot change" here; seen every visit it makes red routine. Fix: cap family levels at amber, tell Rất cao from Cao by word and meter (3 bars against 2), remove `.risk-card.alert`, `.risk-counts .alert`, `.risk-meter.alert`. Command: colorize.

**[P1] The all-unknown state reads as "no risk".** A "0 bệnh" tile is the strongest element and contradicts the lead. Fix: when every row is unknown, drop `.risk-counts` and `.risk-key`; show one panel with the lead as heading, "7 người chưa rõ tiền sử", and "Sửa tiền sử gia đình" as the primary button. Hide zero-count tiles in mixed states. Command: onboard.

**[P2] Reassurance and counts are upside down.** Lead says 2, tiles 1/1/3, section 5 cards; "Trung bình" is excluded from the lead yet listed under "Bệnh cần lưu ý". Fix: move "Tiền sử gia đình không quyết định tất cả…" into `#genetics-lead` at full size; make the lead match the section; on phones drop the tiles and move the edit button below the cards; put the key directly under the cards. Command: layout.

**[P2] Shapes, headings and focus.** `.risk-level.moderate::before` is a filled circle, the shape used for safe. "Cách đọc mức nguy cơ" is an h3 under "Các bệnh khác". The level precedes the h3 in each card. Card h3 (23.9px) is larger than section h2 (22px). Amber edge `#c98a00` is 2.95:1 on white. Focus ring `#f2b705` is 1.82:1 on white (app-wide). Fix: own shape for moderate; disease name first in the card DOM; key as its own section; card titles below section headings; darker amber edge; dark outer ring on focus. Command: audit.

**[P2] Bottom bar with five items.** "Lịch sử đo" wraps to two lines and lifts the bar from 64px to 88px. Fix: "Lịch sử" in the bottom bar only, or return to four items by moving "Giấy tờ" into Hồ sơ. Command: adapt.

## Persona red flags

- Bác Hùng (62, hypertension, poor eyesight): his own disease shows "Đã được chẩn đoán" with no "Nên làm". Red "Rất cao" looks identical to red "Nguy hiểm". Key sentences use semicolons and "một người trong số đó cùng với ông bà".
- Jordan (first-timer): "Trung bình" under "Bệnh cần lưu ý"; bars unexplained until the bottom.
- Sam (screen reader, keyboard): one focusable element in the content with a 1.82:1 ring; tab switch announces nothing; sections unlabelled; tree is a group of plain divs.
- Casey (one-handed phone): edit button in the top third; first "Nên làm" at y=793, just under the fold; tree about 4.5 screens down with no jump links.

## Minor observations

- The stroke card puts "gọi cấp cứu 115 ngay" inside the lowest-emphasis grey card.
- "nhất là với nữ" in the breast-cancer advice ignores the person's sex.
- Tree summary says "Đái tháo đường (5 người)" while the card shows three labels.
- In caregiver view, "Bố" means the viewed person's father, which is not stated.
- Edit form is titled "Sửa hồ sơ sức khỏe", not "Sửa tiền sử gia đình".
- Cards have no entrance animation of their own when the data refreshes.
- `a.brand` is 161x36 on phones, under the 44px target (outside this tab).

## Questions to consider

- A person cannot change their family history. Should this be a daily top-level tab, or a section of Hồ sơ that feeds actions on Hôm nay?
- For one affected grandparent, would "Ông nội mắc bệnh. Nên làm: …" be clearer with no level word at all?
- What should a person with a diagnosed disease get here that Hôm nay does not already give?
