# Supabase Realtime Setup Guide

## Overview

The SEC Dilution Alerts app now supports **real-time updates** using Supabase Realtime. This allows instant notification of new filings (< 1 second) instead of waiting for polling intervals (15 seconds).

## How It Works

1. **Frontend subscribes** to `INSERT` events on the `sec_filing_alerts` table via Supabase Realtime
2. **When Python scraper** saves a new filing to Supabase, the database automatically broadcasts the change
3. **All connected browsers** receive the new alert instantly and update their UI
4. **Polling remains as backup** - if Realtime fails, the app falls back to 15-second polling

## Features

- ✅ **Instant updates** (< 1 second delay)
- ✅ **Automatic reconnection** if connection drops (up to 5 attempts)
- ✅ **Graceful fallback** to polling if Realtime unavailable
- ✅ **Connection status indicator** in UI (shows "Real-time Active" when connected)
- ✅ **No additional cost** - included in Supabase free tier

## Setup Instructions

### 1. Verify Realtime is Enabled in Supabase

Realtime is **enabled by default** for all tables in Supabase. However, you should verify:

1. Go to your Supabase Dashboard
2. Navigate to **Database** → **Replication**
3. Ensure `sec_filing_alerts` table has Realtime enabled (toggle should be ON)

If Realtime is disabled:
1. Click the toggle next to `sec_filing_alerts` to enable it
2. Wait a few seconds for the change to propagate

### 2. No Code Changes Needed

The implementation is **already complete**:
- ✅ `hooks/useRealtimeAlerts.ts` - Realtime subscription hook
- ✅ `app/page.tsx` - Integrated Realtime with fallback polling
- ✅ UI indicators for connection status

### 3. Testing

1. **Open the web app** in your browser
2. **Check the status indicator** in the header:
   - 🟢 "Real-time Active" = Realtime connected (instant updates)
   - 🟡 "Connecting..." = Connecting to Realtime
   - 🟠 "Using Polling" = Fallback to polling (Realtime unavailable)
   - ⚪ "Realtime Unavailable" = Supabase not configured or Realtime disabled

3. **Test instant updates**:
   - Keep the web app open
   - Wait for GitHub Actions to run (scans every 1 minute during market hours)
   - When a new filing is detected and saved to Supabase, it should appear **instantly** in the browser (no refresh needed)

### 4. Verify Console Logs

Open browser DevTools (F12) → Console tab:

**When Realtime connects:**
```
[Realtime] Connecting to Supabase Realtime...
[Realtime] Subscription status: SUBSCRIBED
[Realtime] Successfully connected
```

**When new filing arrives:**
```
[Realtime] New alert received: {ticker: "RVRC", form_type: "S-1", ...}
[Realtime] Processing new alert: RVRC S-1
[Realtime] New alert visible, playing sound
```

**If Realtime fails (fallback to polling):**
```
[Realtime] Connection error: TIMED_OUT
[Realtime] Attempting to reconnect (1/5)...
[Polling] Primary check (Realtime unavailable, polling every 15s)
```

## Architecture

### Realtime Flow
```
Python Scraper → Supabase Database (INSERT) → Realtime Broadcast → All Connected Browsers
```

### Fallback Flow
```
Realtime Unavailable → Polling Every 15s → HTTP Request → Supabase Database → Response → Browser
```

## Connection Status States

- **`connecting`** - Establishing WebSocket connection
- **`connected`** - Realtime active, receiving instant updates
- **`disconnected`** - Connection closed (polling active)
- **`error`** - Connection error (attempting reconnect)
- **`unavailable`** - Supabase not configured or Realtime disabled

## Troubleshooting

### Realtime Not Connecting

1. **Check Supabase Configuration**:
   - Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local`
   - Verify these match your Supabase project credentials

2. **Check Realtime is Enabled**:
   - Go to Supabase Dashboard → Database → Replication
   - Ensure `sec_filing_alerts` table has Realtime enabled

3. **Check Browser Console**:
   - Look for error messages
   - Check if connection attempts are being made

4. **Fallback is Working**:
   - If Realtime fails, polling will automatically activate
   - Check console for "[Polling] Primary check" messages
   - Updates will still work, just with 15-second delay instead of instant

### Realtime Connects But No Updates

1. **Verify Python Scraper is Saving to Supabase**:
   - Check Supabase Dashboard → Table Editor → `sec_filing_alerts`
   - Verify new rows are being inserted

2. **Check Realtime Subscription**:
   - Browser console should show "[Realtime] Subscription status: SUBSCRIBED"
   - If status is "ERROR" or "TIMED_OUT", check network connectivity

3. **Verify Table Permissions**:
   - Supabase Realtime requires proper RLS (Row Level Security) policies
   - Check Supabase Dashboard → Authentication → Policies
   - Ensure `sec_filing_alerts` table allows SELECT for anonymous users

### Still Having Issues?

The app will **always fall back to polling** if Realtime fails, so updates will still work with a 15-second delay. The Realtime feature is an enhancement, not a requirement.

## Cost

- ✅ **Free** - Supabase Realtime is included in the free tier
- ✅ **No additional fees** - Up to hundreds of concurrent connections
- ✅ **Usage-based** - Only broadcasts when new filings are detected

## Performance

- **Latency**: < 1 second (vs 15 seconds with polling)
- **Network**: Minimal (only broadcasts when needed)
- **Battery**: Better (mobile devices stay in low-power state)
- **Server Load**: Lower (no continuous polling requests)

## Next Steps

1. ✅ Verify Realtime is enabled in Supabase Dashboard
2. ✅ Test the connection status indicator
3. ✅ Monitor console logs for Realtime activity
4. ✅ Wait for next GitHub Actions run to see instant updates

Enjoy instant updates! 🚀
