# Plan: "Xác định bệnh di truyền" (hereditary disease identification)

Status: **layers A and B are partially implemented locally** (20 October 2026). Owner's sequence remains **A first, then B; C later**; initial disease set is **4 diseases** (thalassemia, G6PD deficiency, BRCA, familial hypercholesterolemia). Optional age at diagnosis is captured as context only; it does not affect risk levels or rules. Genetic report photos are transcribed for review and storage, but variant classification and live evidence synchronization remain out of scope. This local implementation is not clinically validated.

## 1. Where GeneSense is today

The "Di truyền" tab (`family_risk()` in `backend/app/services/risk_engine.py`, rendered by `renderGenetics()` in `frontend/js/app.js`) gives a **family-history level** for seven common, **multifactorial** conditions: hypertension, diabetes, cardiovascular disease, stroke, dyslipidemia, breast cancer and colorectal cancer. Levels come from how many parents, siblings and grandparents are affected and on which side. The tab already says it is "không phải chẩn đoán hay kết quả xét nghiệm gen".

What it does **not** do:
- **Single-gene (monogenic) hereditary diseases** such as thalassemia, G6PD deficiency or hemophilia, which follow inheritance patterns (dominant, recessive, X-linked) rather than a "more relatives = higher risk" count.
- Spot **family patterns** that call for genetic counselling (for example breast and ovarian cancer on one side, or affected males on the mother's side).
- Classify genetic variants or automatically synchronize **ClinVar/ClinGen** submissions, review status, dates, or conflicts.

The data model covers parents, siblings (with an affected count and brother count), four grandparents, and the mother's brother in the hereditary screen. Optional age at diagnosis is stored as context only; there is not yet a clinician-reviewed early-onset rule.

## 2. What "xác định bệnh di truyền" should mean in GeneSense

GeneSense is not a medical device and cannot diagnose a genetic disease; only a genetic test read by a doctor can. So the system should **identify which hereditary diseases are worth asking a doctor about, and why**, in three layers, each useful on its own:

| Layer | What the user gets | Built from |
|---|---|---|
| **A. Pattern screening** (recommended first) | Per disease: "Nên hỏi bác sĩ về tư vấn di truyền / xét nghiệm" with the reason in plain words (which relatives, which pattern). | The family form, extended a little. |
| **B. Genetic test results** | The user photographs a genetic test report; GeneSense transcribes visible fields for review and storage. Per-disease "Đã xét nghiệm" status remains future work. | The existing Giấy tờ pipeline (AI extraction + review before saving). |
| **C. Carrier planning for couples** | When both partners' carrier status is known **from tests**, the textbook chance for a child (for example 25 % for two thalassemia carriers), with a referral line. | Layer B results of two linked accounts. |

Out of scope (say no clearly): diagnosing from symptoms, interpreting raw DNA files (VCF, consumer DNA exports), and any percentage guessed from family history alone.

## 3. Layer A in detail: the disease list and rules

A short, curated list where a family pattern really changes what a doctor would do, chosen for Vietnam:

| Disease (Vietnamese label) | Inheritance | Pattern that raises a flag | Suggested next step (wording to be reviewed) |
|---|---|---|---|
| Thalassemia (tan máu bẩm sinh) | Autosomal recessive | Any relative with thalassemia or "thiếu máu từ nhỏ, phải truyền máu"; affected siblings with healthy parents; related parents | Hỏi bác sĩ về xét nghiệm sàng lọc người mang gen, nhất là trước khi kết hôn hoặc mang thai |
| G6PD deficiency (thiếu men G6PD) | X-linked | Affected males on the mother's side (maternal grandfather, brother, maternal uncle) | Báo bác sĩ trước khi dùng một số thuốc; hỏi về xét nghiệm G6PD |
| Hemophilia (máu khó đông) | X-linked | Same as G6PD | Hỏi bác sĩ về tư vấn di truyền và xét nghiệm đông máu |
| Familial hypercholesterolemia (tăng cholesterol gia đình) | Autosomal dominant | Very high cholesterol or early heart attack in a parent or sibling (early = needs age; without it, "nhiều thế hệ cùng một bên") | Hỏi bác sĩ về xét nghiệm mỡ máu sớm, kể cả cho con |
| Hereditary breast/ovarian cancer (BRCA) | Autosomal dominant | Two or more relatives on one side with breast or ovarian cancer; any male breast cancer; ovarian cancer at all | Hỏi bác sĩ về tư vấn di truyền và xét nghiệm gen BRCA |
| Lynch syndrome | Autosomal dominant | Colorectal plus endometrial (or a second colorectal) cancer on one side across two generations | Hỏi bác sĩ về tư vấn di truyền và nội soi sớm |
| Polycystic kidney disease (thận đa nang) | Autosomal dominant | A parent or sibling with polycystic kidneys | Hỏi bác sĩ về siêu âm thận |

Rules are plain functions over the family tree (no machine learning), one per pattern type:
- **Dominant:** affected relatives in two generations on the same side, either sex.
- **Recessive:** an affected sibling or relative, or both sides affected, or related parents.
- **X-linked:** affected males on the mother's side.
- **Cancer clusters:** the condition-specific combinations above.

Output per disease: `flag` (`ask_doctor` / `not_seen` / `not_enough_info` / `tested`), the relatives behind it, the pattern in one sentence, the next step. **No levels like "Rất cao" and no percentages** in layer A, so it is not confused with the existing family-risk levels.

## 4. Data changes (layer A)

All in the stored profile JSON, with defaults so existing accounts keep working:
- New condition keys: `thalassemia`, `g6pd`, `hemophilia`, `familial_hypercholesterolemia`, `ovarian_cancer`, `endometrial_cancer`, `polycystic_kidney` (plus the existing `breast_cancer`, `colorectal_cancer`, `dyslipidemia`).
- **Sex of affected siblings** (brothers and sisters counted separately), needed for X-linked patterns.
- **Optional extra relatives:** maternal uncles and aunts, paternal uncles and aunts (count affected, like siblings). Needed for X-linked and dominant patterns; optional so the form stays short.
- **Related parents** (cha mẹ có họ hàng gần): yes / no / không rõ.
- **Age at diagnosis** (optional, earliest known for the selected relative): now collected for clinician-facing context only. Any rule that uses early-onset age needs separate clinical review and must not be inferred from this field yet.

## 5. Build steps

Each step is one pull request, with tests, and with mockups shown before any UI change.

1. **Rules engine (backend only):** `backend/app/services/hereditary.py` with the disease table and pattern functions; `/api/risk` gains a `hereditary` list; unit tests with small made-up family trees for every pattern (dominant, recessive, X-linked, clusters, "not enough info").
2. **Form changes:** the new condition chips, sibling sex, optional uncles and aunts, related-parents question; schema validation and migration defaults; the family tree shows the new relatives.
3. **Di truyền UI:** a new section "Bệnh di truyền nên hỏi bác sĩ" under the existing levels, one card per flagged disease (pattern in plain words, the relatives, next step), and an explainer of the three inheritance patterns. Mockups first.
4. **Doctor's report:** a short "Gợi ý tư vấn di truyền" section.
5. **Layer B, test results:** a "Kết quả xét nghiệm di truyền" document type in Giấy tờ; visible gene/variant/zygosity/lab classification/condition/source excerpt are transcribed verbatim and editable before saving. No automatic diagnosis or profile update. Manual ClinVar/ClinGen links are provided; syncing review status, dates, conflicts, and per-disease "Đã xét nghiệm" status remains future work. Genetic data needs separate privacy/legal review before real-world deployment.
6. **Layer C, couples (later):** only between two linked accounts, only from test results, with textbook Mendelian odds and a referral line.

## 6. Safety and review

- Wording always "nên hỏi bác sĩ", never "bạn mắc" or "bạn mang gen" unless a saved test result says so.
- A **clinical geneticist** (or at least a doctor) reviews the disease list, the rules and every sentence before anything beyond a demo; add a section to `CLINICAL_REVIEW_CHECKLIST.md`.
- Caregiver view: hereditary flags concern the whole family; decide whether relatives who view a profile see them.
- No new third-party services for layer A; layer B reuses the existing Gemini consent flow.

## 7. Decisions for the owner

1. **Which layers, in what order?** Recommendation: A, then B; C later.
2. **The disease list:** the seven in section 3, or a shorter start (for example thalassemia, G6PD, BRCA, familial hypercholesterolemia).
3. **Extra questions on the family form:** sibling sex, uncles and aunts, related parents, and whether to collect "diagnosed before 50" after all.
4. **Where it lives:** a new section inside Di truyền (recommended) or its own tab.
