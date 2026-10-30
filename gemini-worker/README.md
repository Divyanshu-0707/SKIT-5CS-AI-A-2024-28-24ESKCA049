# Decision Board Gemini proxy

This Cloudflare Worker keeps the Gemini API key outside the React app and
accepts requests only from verified Firebase email/password or Google users.
It uses `gemini-3.1-flash-lite`.

## Deploy

Run these commands from this folder:

```powershell
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put FIREBASE_AUTH_API_KEY
npx wrangler deploy
```

Enter secrets only in Wrangler's hidden prompt. `GEMINI_API_KEY` is the Gemini
Developer API key. `FIREBASE_AUTH_API_KEY` is the Firebase Web API key used only
for Identity Toolkit account lookup.

After deploy, append `/v1/board-plan` to the returned Worker URL and place only
that public HTTPS URL in the app's `VITE_GEMINI_PROXY_URL`. Rebuild and redeploy
Firebase Hosting.
