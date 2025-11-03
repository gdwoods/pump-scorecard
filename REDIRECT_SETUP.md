# Redirect Setup: Pump Scorecard → Short Check

This document explains how to redirect traffic from the old Pump Scorecard URL to the new Short Check URL.

## Current Implementation

The `middleware.ts` file automatically redirects all traffic from `pump-scorecard.vercel.app` to `short-check.vercel.app`.

## How It Works

1. **Automatic Detection**: The middleware checks if the incoming request's hostname contains "pump-scorecard"
2. **Redirect**: If detected, it redirects to the corresponding path on `short-check.vercel.app`
3. **Query Parameters**: All query parameters are preserved in the redirect
4. **HTTP 308**: Uses permanent redirect status code (SEO-friendly, browsers cache)

## Deployment Options

### Option 1: Deploy This Codebase to Old Project (Recommended)

1. Connect the old `pump-scorecard` Vercel project to this GitHub repo
2. The middleware will automatically redirect all traffic
3. No additional configuration needed

### Option 2: Vercel Dashboard Redirects

If you prefer not to deploy the codebase to the old project:

1. Go to Vercel Dashboard → `pump-scorecard` project
2. Settings → **Redirects**
3. Add redirect:
   - **Source**: `/:path*`
   - **Destination**: `https://short-check.vercel.app/:path*`
   - **Status Code**: `308 Permanent`

## Testing

After deployment:
- Visit `https://pump-scorecard.vercel.app` → Should redirect to `https://short-check.vercel.app/short-check`
- Visit `https://pump-scorecard.vercel.app/pump-scorecard` → Should redirect to `https://short-check.vercel.app/pump-scorecard`
- Query params: `https://pump-scorecard.vercel.app/?ticker=AAPL` → Should redirect to `https://short-check.vercel.app/?ticker=AAPL`

## Notes

- The redirect preserves paths and query parameters
- HTTP 308 is a permanent redirect (good for SEO, browsers cache it)
- If you have custom domains on the old project, they will also redirect

