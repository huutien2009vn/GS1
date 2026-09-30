---
target: GeneSense frontend
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
target_fingerprint: "sha256:ad37e990dbda450a090393437ea603f7627c0f93129c1bc8ff64c346a8c8ceb8"
target_path: "F:\\CLAUDE CODE\\GeneSense-share\\frontend\\index.html"
timestamp: 2026-09-30T13-48-16Z
slug: frontend-index-html
---
## Design Health Score: 27/40 (Acceptable, top of band)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | Today flashes "Chưa có dữ liệu" before records load |
| 2 | Real world match | 3 | "bản demo" in server copy, dot decimals, "Béo phì" without context, English sign in a photo |
| 3 | User control | 3 | Edit wizard exit only in header; deletes have no undo |
| 4 | Consistency | 2 | Status words vary; amber means "cần chú ý" and "has a disease"; native confirm beside custom dialogs |
| 5 | Error prevention | 3 | Input limits, BP pair validation, confirm before delete |
| 6 | Recognition | 3 | Range bars without numbers; safe readings have no word |
| 7 | Flexibility | 2 | No repeat-measure shortcut |
| 8 | Minimalist design | 3 | Restrained; photo clash, 3-line demo banner, full-width "Tải lại" |
| 9 | Error recovery | 3 | Specific, actionable messages |
| 10 | Help | 2 | No help entry point; sub-scores unexplained |

## Design Specificity Verdict
Mostly authored: navy header, one Vietnamese typeface, shape plus word status, emergency panel, range bars and family tree are product-specific. Detector: 4 findings, all judged false positives (tree connector as side-tab, hidden preview img, segmented control, navy elevation shadow as dark-glow). Browser: only line-length (legal footer ~124ch, recent-emergency note ~94ch); none on mobile. Smallest text 16px, lowest contrast 6.08:1, 0 gradients, 0 uppercase/tracking, no overflow at 375px. Remaining tells: advice photos have no single art direction (sunset silhouettes vs product flat-lays), sprinters for "đi bộ từ từ", English "No smoking" sign, glucose meter shows a reading; "của bản demo" in server messages; dot decimals; en-dash "10–15"; images 640px served at 136px.

## Priority Issues
- [P1] Mixed signals for 24h after an emergency: green headline, red error-styled note, "Tiếp tục thói quen lành mạnh" follow-up. clarify.
- [P1] Advice photo execution: mixed styles, orange clash, copy mismatches. quieter.
- [P1] Dev and locale leaks: "bản demo", dot decimals, space before %, en-dash. clarify.
- [P2] Lịch sử đo IA: advice first, list ~2.9 screens down on mobile, full-width "Tải lại", delete buried. layout.
- [P2] Family tree on mobile loses connectors, amber reused for disease, role=img hides nodes. adapt.

## Persona Red Flags
Jordan: disabled Google button leads login; unexplained sub-scores; dead Giấy tờ tab.
Sam: tree hidden from screen readers; focus not moved to emergency panel; low non-text contrast on diastolic line and range zones.
Casey: primary buttons clipped by tab bar at 375x812; dialog save below fold; wizard exit off-screen.
Bác Hùng: blunt "Béo phì"; sprinters and English sign; green headline plus red box after emergency; native confirm "localhost says".

## Minor Observations
Edit mode keeps onboarding title; BP chart lacks 180/120 marker; alert and emergency share red tag; inline style on emergency dialog; "Lịch sử" vs "Lịch sử đo"; warning style identical to error; unused icons.

## Questions to Consider
- Should onboarding happen on the family tree itself?
- Should Today show the one advice card that matters today?
- Would a Ministry-of-Health app use stock photography, and in what single art direction?
