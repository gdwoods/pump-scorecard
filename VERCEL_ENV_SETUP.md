# Setting NEXT_PUBLIC_BASE_URL in Vercel

## Quick Steps

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Select your project** (short-check)
3. **Go to Settings** → **Environment Variables**
4. **Add new variable**:
   - **Key**: `NEXT_PUBLIC_BASE_URL`
   - **Value**: Your production domain (see below)
   - **Environments**: Select all (Production, Preview, Development)
5. **Redeploy** your project

## Finding Your Production Domain

### Option 1: Check Vercel Dashboard
- Go to **Settings** → **Domains**
- Your production domain will be listed (e.g., `short-check.vercel.app`)
- Use the full URL: `https://short-check.vercel.app`

### Option 2: Check Recent Deployments
- Go to **Deployments** tab
- Click on the latest production deployment
- The URL shown is your production domain

### Option 3: Custom Domain
- If you have a custom domain configured (e.g., `shortcheck.com`)
- Use that instead: `https://shortcheck.com`

## Example Values

✅ **Correct formats:**
- `https://short-check.vercel.app`
- `https://shortcheck.com`
- `https://www.shortcheck.com`

❌ **Wrong formats:**
- `short-check.vercel.app` (missing `https://`)
- `http://short-check.vercel.app` (use `https://` not `http://`)

## After Setting

Once you set this and redeploy:
- New share links will point to your production domain
- Share links will be publicly accessible (no Vercel login required)
- Works in incognito/private browsing mode

## Other Required Environment Variables

Add these in Vercel → Project → Settings → Environment Variables (all envs):

- `GOOGLE_CLOUD_VISION_API_KEY` — Google Cloud Vision OCR
- `FINNHUB_API_KEY` — external news (score + Recent News card)
- `NEXT_PUBLIC_BASE_URL` — your production domain (no path)
- Vercel KV credentials (choose whichever pair your account provides):
  - `KV_REST_API_REDIS_URL` and `KV_REST_API_REDIS_TOKEN`
  - or `KV_REST_API_URL` and `KV_REST_API_TOKEN`

Notes:
- In local dev, share storage uses in‑memory cache and resets on reloads.
- Preview deployments may require Vercel auth; use production domain for public share links.

## Troubleshooting

**Still seeing login page?**
- Verify the environment variable is set correctly
- Make sure you redeployed after adding it
- Check that you're using the production domain (not a preview URL)
- Check Vercel logs to see what URL is being generated

