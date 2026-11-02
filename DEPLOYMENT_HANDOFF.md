# GeneSense deployment handoff — 2026-11-02

## Live services

- Web/API: https://genesense-gs1.vercel.app/ (`huutien2009vn`, Vercel project `genesense-gs1`, production branch `feature/ai-assistant-responsive`, initial commit `737a913`).
- Android download: https://genesense-android.vercel.app/ (`genesense-android` Vercel project). The signed test APK at `/GeneSense-debug.apk` opens the web/API above.
- Database: Neon Free `genesense-gs1-db` in Singapore, linked to `genesense-gs1` Production only. Vercel supplies `DATABASE_URL` as a Secret; do not copy it into Git or the APK.

## Verified

- Web `/` and `/api/health` respond 200.
- `/api/auth/config` initially reported demo login enabled; Google and AI disabled. The user-provided Gemini key was subsequently added to Vercel as a Production Secret. A redeploy and live AI request are still needed to validate it.
- Synthetic demo login and `/api/auth/me` responded 200 with a persistent cookie.
- Android APK installed and launched in an Android 36 emulator; it loaded the GS1 login and demo onboarding screens.
- Public APK download responded 200 and matched the locally signed file by SHA-256.
- Bluetooth permission dialog opened from the native overflow menu. Device scanning and a device-specific BLE protocol are not implemented.

## Remaining configuration

1. Google Cloud Console is blocked on the currently signed-in account until two-step verification is enabled. Use the intended project owner account, enable two-step verification, create an External OAuth consent screen and a Web application OAuth client with redirect URI `https://genesense-gs1.vercel.app/api/auth/google/callback`.
2. Save `GOOGLE_CLIENT_ID` as Config and `GOOGLE_CLIENT_SECRET` as Secret in Vercel project `genesense-gs1`, Production. Redeploy. Verify `/api/auth/config` reports `google_enabled: true`, then complete sign-in on the public web.
3. Android WebView does not share the browser's Google sign-in session. Native Google sign-in or a Trusted Web Activity with verified Digital Asset Links is needed before claiming Google OAuth works inside the APK.
4. Rotate the Gemini key previously sent in chat and currently saved as `GOOGLE_AI_API_KEY` in Vercel Production. Replace it with a fresh Secret, redeploy, and verify a synthetic AI request with a real non-demo account and consent. No AI key is included in source or APK.
5. Demo accounts are public and capped at 10 new accounts per hour; each is removed after 3 days when another demo account is requested. Do not enter real patient data in a demo account.

To rebuild the APK, run `android-apk/build.ps1` with Android SDK 34, Build Tools 36.1 and Android Studio JBR. The output is a debug-signed APK for direct testing, not a Play Store release.
