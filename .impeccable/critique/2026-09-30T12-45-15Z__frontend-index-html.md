---
target: GeneSense frontend
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
target_fingerprint: "sha256:aa274b90ae602d92ab0c9b1671678cc3039c9745fb25872cc58b6906693a6dc5"
target_path: "F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
timestamp: 2026-09-30T12-45-15Z
slug: frontend-index-html
---
## Design Health Score: 25/40 (Acceptable, top of band)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | "Tình trạng theo lần đo gần nhất" is false after a simulated save; explanation only in a 4.5s toast |
| 2 | Real world match | 3 | "chưa được bật trên máy chủ này" is server jargon; score 37/100 "càng thấp càng tốt" beside "Nguy hiểm" |
| 3 | User control | 2 | Readings cannot be deleted; one-tap logout; "Về hồ sơ" discards wizard edits silently |
| 4 | Consistency | 3 | "Lịch sử đo" vs "Lịch sử"; "Đo lại" and "Ghi chỉ số" duplicate in emergency |
| 5 | Error prevention | 2 | One normal reading erases emergency with no trace; no re-check step for extreme values |
| 6 | Recognition | 3 | Summary says "hướng dẫn bên dưới" but tips live on History |
| 7 | Flexibility | 2 | No accelerators; manual "Tải lại" |
| 8 | Minimalist design | 3 | Calm; emergency repeats message 3-4x; chart gradient off-system |
| 9 | Error recovery | 2 | Giấy tờ is a dead end with a disabled primary button |
| 10 | Help | 2 | No how-to-measure hint in dialog; BMI unexplained |

## Design Specificity Verdict
Mostly specific and credible: one typeface, flat panels, navy header with tab strip, colour only for status, shape plus label on status. Detector: 108 findings to 2 (both likely false positives: hidden JS-filled img, segmented control). Browser: only line-length (legal footer ~120ch, tip items ~99ch). 0 gradients in CSS, 0 uppercase/tracking, one radius, smallest text 16px, lowest contrast 6.08:1. Remaining tells: chart area gradient and teal band (chart.js:74-83), tagline repeated in header, legal footer plus demo banner on every tab, decimal point instead of Vietnamese comma, chart x-axis without dates.

## Priority Issues
- [P1] Emergency state contradicts itself and clears too easily: score under "Nguy hiểm", duplicate primary, no no-symptom instruction, alarm vanishes after one normal reading, neutral toast over alarm. clarify, harden.
- [P1] Readings cannot be corrected or deleted (breaks "delete anytime"). harden.
- [P2] Today points to guidance on another tab. clarify.
- [P2] Demo/server plumbing in patient UI: disabled Google button and scan button with "máy chủ" copy, "Dùng dữ liệu mẫu" as a peer of "Kết nối", "Tải lại" first on History. distill.
- [P3] Onboarding step 1 has ~13 controls; activity minutes hard to estimate; feedback form on profile. onboard, layout.

## Persona Red Flags
Jordan: disabled Google button, unclear Kết nối vs Dùng dữ liệu mẫu, dead Giấy tờ tab, sub-scores that do not sum.
Sam: canvas chart without text summary, 14px axis labels, 4.5s toasts, dialog focus on close button, rating aria-pressed mismatch.
Casey: prominent unconfirmed Đăng xuất, Lưu chỉ số below fold in dialog, logo link 36px tall.
Bác Hùng: "Không có cảnh báo" instead of "Bình thường", unexplained mg/dL and SpO₂, decimal point, no instruction when no symptoms.

## Minor Observations
"Không tính dữ liệu mẫu" note cryptic; time-before-date format; Giới tính missing on Hồ sơ; family icon for Hồ sơ; chart splits by source; status word wraps on mobile.

## Questions to Consider
- Should anything else exist on Today while the emergency panel shows?
- Does a patient ever need the 0-100 score?
- Should Giấy tờ be hidden until the feature works?
