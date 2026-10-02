---
target: "Medicine schedule (frontend/index.html #records-view, Lịch uống thuốc)"
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
target_fingerprint: "sha256:5d7ca8f60e078a8e2af814703d598b058be98fe5ba4a8e9ae5d5e917439be48d"
target_path: "F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
timestamp: 2026-10-02T10-29-07Z
slug: frontend-index-html
---
Method: dual-agent (A: a3b738270b2a8b75a · B: a450f046e14d94839), run one after the other on one Playwright browser

# Critique: medicine schedule (branch feat/medication-schedule, commit 4a02d1e)

Scope: the new medicine schedule only. The "Giấy tờ" tab with its sub-tabs "Lịch uống thuốc" and "Giấy tờ đã lưu", the "Thuốc hôm nay" blocks, the "Tất cả thuốc" list, the "Thêm thuốc" dialog and the link line on Hôm nay, inspected live in Edge at 1100x800 and 375x812 on a trial account with 4 medicines. The medicine cards of the scan review step were read from code, not seen live by the reviewers.

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | "Thuốc hôm nay" does not show which time of day is now, and a dose cannot be marked as taken. |
| 2 | Match with the real world | 3 | Sáng, Trưa, Chiều, Tối and "1 viên, sau ăn" match a Vietnamese prescription. "So với bữa ăn" with "Không ghi" is stiff. |
| 3 | User control and freedom | 3 | Hủy, close, Sửa and a confirmation before Xóa exist. No undo, and no way to stop a medicine without deleting it. |
| 4 | Consistency and standards | 3 | Reuses the app's tabs, panels, chips and dialog. The page is titled "Giấy tờ sức khỏe" while its default sub-tab is about medicine. |
| 5 | Error prevention | 2 | An unsure name starts unticked in the scan step. The manual dialog saves with no time of day and files the medicine under "Khi cần" without asking. |
| 6 | Recognition rather than recall | 3 | Every block repeats name, strength, amount and meal. The Hôm nay line shows only a count. |
| 7 | Flexibility and efficiency | 2 | One path for everyone, which suits the audience, but no quick "taken" action. |
| 8 | Aesthetic and minimalist design | 3 | Plain and quiet. The same medicines appear twice on one screen (today's blocks, then the full list): 2095px for 4 medicines on a phone. |
| 9 | Error recovery | 3 | Inline error with `role="alert"`. A missing name is caught only by the browser's own bubble, in the browser's language. |
| 10 | Help and documentation | 3 | Good inline help and the safety note under the schedule. Nothing explains how the full list differs from today's blocks. |
| | **Total** | **27/40** | |

## Design specificity verdict

Grounded in this product. The four fixed time-of-day blocks, the "Trên đơn ghi" line, the unticked-when-unsure rule and the note to follow the paper prescription and the doctor are choices of a not-a-medical-device health app for this audience. The one interchangeable part is "Tất cả thuốc", a standard edit-and-delete list.

**Deterministic scan:** 6 detector findings in the three frontend files, all warnings, 5 of them in older code (two images without `src` that JS fills in, a family-tree connector read as a side tab, a navy shadow, the older measuring tabs). One touches new markup: `cramped-padding` on the sub-tab group, which reuses the existing `.measurement-tabs` style. No finding in the new CSS block or the new functions. The in-page overlay was not injected: the page's Content-Security-Policy refuses it.

**Measurements (both widths):** smallest text 16px; all text contrast between 6.6:1 and 15.7:1; no sideways scroll on the page or in the dialog; every form control labelled; heading order h1, h2, h3 without gaps; no policy violations.

## Overall impression

The schedule itself reads like a pill organiser and stays out of the way on Hôm nay. The weak points are at the edges: the add dialog on a phone, a silent default to "Khi cần", and finding the schedule at all.

## What's working

1. Schedule by time of day: only the blocks that have a medicine are shown, name in bold, amount and meal below.
2. Honest scan review: an unsure name starts unticked with an amber message, and the prescription's own wording is quoted beside the time boxes.
3. Restraint on Hôm nay: one text line, hidden without medicines and while the emergency panel shows.

## Priority issues

**[P1] On a phone the "Thêm thuốc" dialog hides its save button.** At 375x812 the dialog is 780px tall and its content 1117px; "Lưu thuốc" starts 265px below the visible part, and focus lands on the close button. An older user fills what they see, finds no button and may close the dialog. Fix: keep Hủy and Lưu thuốc always visible at the bottom of the dialog, put the optional fields (start date, days, note) behind a closed "Thêm chi tiết", focus "Tên thuốc" on open.

**[P1] A medicine saved by hand with no time of day goes to "Khi cần" silently.** The only guard is a 16px grey note. A daily pill can vanish from Sáng. Fix: a fifth box "Khi cần", and require one choice with the message "Hãy chọn buổi uống, hoặc chọn Khi cần." Same in the scan card.

**[P1] The schedule is hard to find.** The tab is called "Giấy tờ", the heading "Giấy tờ sức khỏe". On Hôm nay at 375x812 the link line sits at y 753 to 811, behind the bottom navigation (top at 747) until the user scrolls. Fix: name the tab and heading for both ("Thuốc và giấy tờ"), and place the link inside the status panel so it is on the first screen.

**[P2] "Sửa" and "Xóa" are small and close together.** 34x44 and 36x44px with a 16px gap, on every row; both fail the 44px width. Fix: widen both to at least 64px with 24px between, or keep only "Sửa" in the row and move "Xóa thuốc này" into the edit dialog.

**[P2] The same medicines are listed twice with no explanation.** "Thuốc hôm nay" and "Tất cả thuốc" show the same items when all are active. Fix: one lead line on the full list ("Danh sách để sửa, xóa. Gồm cả thuốc đã hết đợt."), or collapse it behind a button.

**[P2] "Thuốc hôm nay" does not say what to take now.** All blocks have equal weight. Fix: put the current time of day first or mark its heading. A "taken" tick is the planned phase 2.

**[P3] Wording and placement.** "So với bữa ăn" / "Không ghi" could be "Uống trước hay sau ăn" / "Không ghi trên đơn". "Thêm ảnh giấy tờ" and "Thêm thuốc" sit 800px apart on a phone. "4 loại" reads better as "4 loại thuốc". The middle dot in "Sáng · 1 viên" may be invisible to a low-vision reader. The dialog has no `aria-labelledby`.

## Persona red flags

**Older first-time user with poor eyesight, on a phone:** finds no word "thuốc" in the bottom navigation; the link on Hôm nay is under the fold. Opens "Thêm thuốc", sees five fields and no save button. Skips the four small boxes and the medicine lands in "Khi cần". In the scan review a four-medicine prescription shows about 40 controls in one scroll, after the vitals section. The red "Xóa" on every row looks like a warning about the medicine.

**Adult child caring for a parent:** the schedule is not part of the shared view yet, cannot be printed, and has no record of doses taken. All three are the planned phase 2.

## Minor observations

- The date field follows the browser's language, so it can show month first while the list shows day first.
- With three time blocks, one will sit alone on a second row on a wide screen (not seen live).
- The link line on Hôm nay floats between two panels on a wide screen.
- Not seen live: empty states, the "Khi cần", Trưa and Chiều blocks, the "Chưa bắt đầu" and "Đã hết đợt" tags, save and delete, the scan review cards.

## Questions to consider

- Should "Thuốc" be a word in the navigation, since it is the only part of this tab used every day?
- Is the full list needed on the same screen as the schedule, or is it a settings task?
- Should a relative with a share code see the schedule?
