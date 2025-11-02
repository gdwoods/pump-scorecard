# Shareable Links Feature - Setup Guide

The shareable links feature allows users to share Short Check analysis results with team members via a unique, time-limited URL.

## How It Works

1. **Generate Link**: User clicks "Share" button after analysis
2. **Store Data**: Analysis data is stored with a unique 12-character ID
3. **Share URL**: Link like `your-domain.com/share/abc123xyz456`
4. **View Results**: Anyone with the link can view the full analysis
5. **Auto-Expire**: Links expire after 7 days automatically

## Storage Options

### Option 1: Vercel KV (Recommended for Production)

Vercel KV is a Redis-based key-value store that persists data across deployments.

**Setup:**
1. Install Vercel KV package:
   ```bash
   npm install @vercel/kv
   ```

2. Create a Vercel KV database:
   - Go to Vercel Dashboard → Storage → Create Database → KV
   - Or use: `vercel kv create`

3. Link to your project:
   - Go to your project settings → Environment Variables
   - Vercel will automatically add `KV_REST_API_URL` and `KV_REST_API_TOKEN`

4. Redeploy your application

**Benefits:**
- ✅ Persistent storage (survives deployments)
- ✅ Automatic expiration
- ✅ Scalable and fast
- ✅ No additional cost for small usage

### Option 2: In-Memory Cache (Development/Testing)

If Vercel KV is not set up, the system automatically falls back to an in-memory cache.

**Limitations:**
- ❌ Data lost on server restart
- ❌ Data lost on deployment
- ❌ Not suitable for production

**Use Case:**
- Local development
- Testing the feature
- Temporary deployments

## Environment Variables

If using Vercel KV, these are automatically added by Vercel:
- `KV_REST_API_URL` - KV endpoint URL
- `KV_REST_API_TOKEN` - KV authentication token

Optional (for custom domains):
- `NEXT_PUBLIC_BASE_URL` - Your app's base URL (defaults to Vercel URL)

## Features

✅ **7-Day Expiration**: Links automatically expire after 7 days
✅ **Unique IDs**: 12-character random URLs (hard to guess)
✅ **Full Analysis**: Includes all score data, breakdown, and extracted metrics
✅ **Copy to Clipboard**: One-click copy functionality
✅ **Error Handling**: Clear error messages for expired/invalid links
✅ **No Registration**: Anyone with the link can view (no auth required)

## Usage

1. Complete a Short Check analysis
2. Click the **"Share"** button in the Quick Actions toolbar
3. Link is automatically copied to clipboard
4. Share via email, Slack, Discord, etc.
5. Recipient clicks link to view full analysis

## Security Notes

- Links contain no personal information
- Only analysis results are shared
- No authentication required (by design)
- Links expire automatically
- Random IDs prevent easy guessing

## Troubleshooting

**"Failed to generate share link"**
- Check if Vercel KV is properly configured
- Verify environment variables are set
- Check Vercel deployment logs

**"Share link not found"**
- Link may have expired (7 days)
- Link ID may be invalid
- Data may have been cleared (if using in-memory cache)

**Links not persisting**
- Using in-memory cache (requires Vercel KV for persistence)
- Check Vercel KV configuration

## Future Enhancements

Potential additions:
- Password-protected shares
- Custom expiration times
- View tracking/analytics
- Delete/share management UI
- Email share functionality

