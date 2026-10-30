# Decision Board

Decision Board is a light-mode collaborative visual workspace for notes and
mind maps. A board can be a whiteboard, a mind map, or both together on one
shared canvas.

Live website: [decisionboard.divyanshusaraswat.in](https://decisionboard.divyanshusaraswat.in)

## Working features

- Firebase email/password, Google, and optional private guest authentication
- Registered-account-only shared board links
- Real-time Firestore cards, comments, votes, nodes, and connections
- Board ownership, locking, access settings, rename, and deletion
- Browser-generated PNG export
- Prompt-based Gemini board plans for notes, mind maps, or both
- Built-in fallback plans when Gemini is unavailable
- Responsive desktop and mobile board controls

## Architecture

The React/Vite frontend is hosted on Firebase Hosting. Firebase Authentication,
Cloud Firestore, and Security Rules stay on the Spark plan.

Gemini does not use Firebase AI Logic, App Check, Cloud Functions, Storage, or
any billed Firebase product. A small Cloudflare Worker verifies the Firebase
user and calls the Gemini Developer API. The Gemini key exists only as a Worker
secret and never enters the browser, repository, or Firebase build.

## Local development

```powershell
cd app
npm install
npm run dev
```

Copy `app/.env.example` to `app/.env.local` and provide the Firebase Web app
values. `VITE_GEMINI_PROXY_URL` may remain empty; the board stays usable with a
built-in starter plan.

## Verification

```powershell
cd app
npm run check
npm run test:rules:emulator
```

## Deployment

Frontend and Firestore rules:

```powershell
cd app
npm run deploy:firebase
```

Run each command block from the repository root. The verification commands
require the original `app/tests/` folder, which must be included in the submission.

Gemini proxy setup is documented in [app/gemini-worker/README.md](app/gemini-worker/README.md).
Use your own Firebase configuration in `app/.env.local`; keep that file out of Git.
The alternate Firebase Hosting URL is:

[decisionboard-0707.web.app](https://decisionboard-0707.web.app)
