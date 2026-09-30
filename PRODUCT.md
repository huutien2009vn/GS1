# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Vietnamese adults at home who track their own chronic-disease risk, often because of a family history of disease. They use the app on a phone (installed as a PWA) or a computer. Many have low tech literacy, and some are older with reduced vision.

## Product Purpose

GeneSense AI Core supports proactive screening and long-term management of chronic disease. It combines three layers: family history (PGRS), body condition (BRS), and vital-sign variability. Success means a user understands their current status (green/yellow/red), records readings easily, and knows what to do next.

Current stage: a competition demo. Polish, clarity, and a convincing end-to-end flow matter more than launch readiness.

## Positioning

A three-layer risk score that is explainable: a pedigree score from F1/F2 family disease burden, multiplied with body risk and vital-sign deviation, with dynamic thresholds that tighten when family risk is high. AI (Google Gemini) only interprets an already-locked score; rule-based advice works without AI.

## Operating Context

- Google OpenID Connect sign-in, or a demo account when Google is not configured.
- First-run onboarding in 3 steps: personal info, close family, paternal/maternal lineage.
- "Hôm nay" (Today) tab: status, latest readings, and required actions only. Charts and advice live in "Lịch sử" (History).
- Readings come from manual entry, Web Bluetooth devices (heart rate, blood pressure, pulse oximeter, glucose), or a clearly labeled simulation.
- Users can photograph lab results, prescriptions, or checkup papers; AI extracts the content and the user must review and confirm before saving. Original images are never stored.

## Capabilities and Constraints

- Stack: FastAPI backend, vanilla JS PWA frontend (`frontend/`), SQLite for demo, Neon PostgreSQL for production.
- UI language: Vietnamese (`lang="vi"`).
- Not a medical device. Results must never read as diagnosis or prescription. Emergency signs (SpO₂ < 90%, BP ≥ 180/120) always override the score and point to emergency services.
- Never show fake data when nothing has been measured. Simulated readings must stay labeled.
- Web Bluetooth does not work on iOS Safari; manual entry must stay a full path.
- AI features require explicit user consent (per profile, and per image analysis).

## Evidence on Hand

- No real testimonials, clinical validation, user counts, or press. Do not fabricate them.
- Risk coefficients use demo reference ranges, not clinically calibrated data.
- Assets: `frontend/assets/favicon.svg`, inline SVG icons in `frontend/js/icons.js`.

## Product Principles

1. Status first: the user sees how they are doing today before any detail.
2. Honest by default: no fake data, no diagnostic claims, clear labels on simulation and AI output.
3. Plain Vietnamese over medical jargon; explain every score in everyday words.
4. The user stays in control of health data: review before save, consent before AI, delete anytime.
5. Every flow must work by hand on a phone, without Bluetooth or AI.

## Accessibility & Inclusion

- Large text and high contrast for older users with low vision.
- Mobile first: design for phone widths before desktop.
- Low tech literacy: few steps per task, plain language, obvious primary actions.
- Status must never rely on color alone (green/yellow/red also needs a label or icon).
