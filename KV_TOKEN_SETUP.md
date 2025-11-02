# Finding or Creating KV Token

If you only see `KV_REST_API_REDIS_URL` but not `KV_REST_API_REDIS_TOKEN`, here's how to get it:

## Option 1: Check Vercel Storage Dashboard

1. Go to **Vercel Dashboard** → Your Project → **Storage** tab
2. Click on your **KV database**
3. Look for **"Environment Variables"** or **"Connection Info"** section
4. The token should be listed there
5. Copy it and add as `KV_REST_API_REDIS_TOKEN` in your project's environment variables

## Option 2: Reconnect the KV Database

Sometimes Vercel doesn't create all variables on first connect:

1. Go to **Storage** → Your KV database
2. Click **"..."** (three dots) → **Disconnect** from project
3. Click **Connect to Project** again
4. Select your project
5. Enter prefix: `KV_REST_API`
6. Select all environments
7. Click **Connect**

This should create both `KV_REST_API_REDIS_URL` and `KV_REST_API_REDIS_TOKEN`

## Option 3: Manual Token Creation

If the above doesn't work:

1. Go to **Vercel Dashboard** → Your KV database
2. Check the **"Settings"** or **"Connection"** tab
3. Look for **REST API Token** or **Access Token**
4. Copy the token value
5. Go to your **Project** → **Settings** → **Environment Variables**
6. Add new variable:
   - **Key**: `KV_REST_API_REDIS_TOKEN`
   - **Value**: (paste the token)
   - **Environments**: Select all

## Verify Both Variables Exist

After setup, you should have:
- ✅ `KV_REST_API_REDIS_URL` (already exists)
- ✅ `KV_REST_API_REDIS_TOKEN` (needs to be added)

## Testing

After adding the token and redeploying:

1. Generate a new share link
2. Check Vercel logs - you should see:
   - `[Share] ✅ KV client initialized with URL=true, Token=true`
   - `[Share] ✅ Saved to KV: [shareId]`
3. Test the share link - it should work!

## Note

The current code will attempt to connect with just the URL, but **Redis REST API typically requires both URL and token**. Without the token, connections may fail. Adding the token ensures reliable operation.

