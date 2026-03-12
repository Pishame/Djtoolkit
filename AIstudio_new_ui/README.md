<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f045629d-01f9-4e1e-bdf6-1a2ba182bbe4

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Optional: Secure API Server Integration

To keep third-party secrets off desktop clients, route auth/spotify/billing through a server:

1. Configure and run: [`../secure_api_server`](../secure_api_server)
2. Add these frontend env vars in `.env.local`:
   - `VITE_API_BASE_URL=http://localhost:8787`
   - `VITE_ENABLE_SERVER_AUTH=1`
   - `VITE_ENABLE_SERVER_SPOTIFY=1`
   - `VITE_ENABLE_SERVER_BILLING=1`

With flags off (`0`), the UI falls back to local preview behavior.
