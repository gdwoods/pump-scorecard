# Vercel Deployment Guide for SEC Scraper Web

## 🔑 Environment Variables

Set these in **Vercel Dashboard → Project Settings → Environment Variables**:

### Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
  - Example: `https://qnbobgnexagjlgzpeigb.supabase.co`
  - Get it from: [Supabase Dashboard](https://supabase.com/dashboard) → Your Project → Settings → API

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key
  - Starts with `sb_publishable_...`
  - Get it from: [Supabase Dashboard](https://supabase.com/dashboard) → Your Project → Settings → API → Project API keys → `anon` `public`

## 📝 Local Development Setup

1. **Create `.env.local` file** in the `web/` directory:
```bash
cd /Users/garthwoods/projects/sec_scraper/web
cp .env.local.example .env.local
# Then edit .env.local with your actual values
```

2. **Or create manually**:
```env
NEXT_PUBLIC_SUPABASE_URL=https://qnbobgnexagjlgzpeigb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

3. **Install dependencies**:
```bash
npm install
```

4. **Run development server**:
```bash
npm run dev
```

5. **Open in browser**: http://localhost:3000

## 🚀 Vercel Deployment Steps

### 1. Push to GitHub

```bash
cd /Users/garthwoods/projects/sec_scraper
git init
git add .
git commit -m "Initial commit: SEC scraper web app"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `web` (important!)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### 3. Set Environment Variables in Vercel

1. In Vercel project settings → Environment Variables
2. Add both variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Apply to: Production, Preview, Development
4. Redeploy after adding variables

### 4. Deploy

- Vercel will automatically deploy when you push to GitHub
- Or manually trigger deployment from Vercel Dashboard

## ⚠️ Important Notes

- **Root Directory**: Make sure to set the root directory to `web/` in Vercel settings since the Next.js app is in a subdirectory
- **Environment Variables**: Must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser
- **Supabase RLS**: Ensure Row Level Security policies allow reading from `sec_filing_alerts` table (or use service_role key for server-side operations)

## 🐛 Troubleshooting

### Build Fails
- Check that root directory is set to `web/` in Vercel
- Verify all dependencies are in `package.json`
- Check build logs in Vercel dashboard

### Environment Variables Not Working
- Variables must start with `NEXT_PUBLIC_` for client-side access
- Redeploy after adding/changing environment variables
- Check Vercel environment variables are set for the correct environment (Production/Preview)

### Supabase Connection Issues
- Verify Supabase URL and anon key are correct
- Check Supabase table name matches (`sec_filing_alerts`)
- Ensure Supabase RLS policies allow public read access (or use service_role key)

## 📚 Additional Resources

- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment)
- [Vercel Documentation](https://vercel.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
