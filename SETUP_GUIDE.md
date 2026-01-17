# SEC Scraper - Complete Setup Guide

## ✅ What's Been Completed

### Phase 1: Next.js Project Setup ✅
- Next.js 16 with TypeScript and Tailwind CSS
- Project structure matching pump-scorecard pattern
- Dependencies configured

### Phase 2: Web Application ✅
- API routes for querying Supabase
- UI components (AlertTable, AlertFilters)
- Main dashboard page with filtering
- TypeScript types defined

### Phase 3: Documentation ✅
- README files
- Vercel deployment guide
- Environment variable setup instructions

## 🚀 Next Steps: GitHub & Vercel Setup

### Step 1: Initialize Git Repository

```bash
cd /Users/garthwoods/projects/sec_scraper
git init
git add .
git commit -m "Initial commit: SEC scraper with web app"
```

### Step 2: Create GitHub Repository

1. Go to [GitHub](https://github.com/new)
2. Create a new repository (e.g., `sec-scraper`)
3. Don't initialize with README (we already have one)

### Step 3: Connect and Push

```bash
git remote add origin https://github.com/YOUR_USERNAME/sec-scraper.git
git branch -M main
git push -u origin main
```

### Step 4: Deploy to Vercel

1. **Go to [Vercel Dashboard](https://vercel.com/dashboard)**
2. **Click "Add New Project"**
3. **Import your GitHub repository** (select `sec-scraper`)
4. **Configure Project**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `web` ← **IMPORTANT!**
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`
5. **Click "Deploy"**

### Step 5: Set Environment Variables in Vercel

After first deployment:

1. Go to **Project Settings** → **Environment Variables**
2. Add these variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://qnbobgnexagjlgzpeigb.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_kWdtDptUsBp6yDrSZsuRLA_kcnXGbz_
   ```
3. Select **All environments** (Production, Preview, Development)
4. Click **Save**
5. **Redeploy** your project (Vercel Dashboard → Deployments → ... → Redeploy)

### Step 6: Verify Deployment

1. Visit your Vercel URL (e.g., `https://sec-scraper.vercel.app`)
2. You should see the SEC Dilution Alerts dashboard
3. Verify alerts are loading from Supabase

## 📝 Local Development

### Web App

```bash
cd web
npm install

# Create .env.local
cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=https://qnbobgnexagjlgzpeigb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_kWdtDptUsBp6yDrSZsuRLA_kcnXGbz_
EOF

npm run dev
```

### Python Scraper

```bash
pip install -r requirements.txt
python scan_until_found.py --min-filings 5 --parse-details --analyze --save
```

## 🔗 Quick Links

- **Supabase Dashboard**: https://supabase.com/dashboard/project/qnbobgnexagjlgzpeigb
- **Vercel Dashboard**: https://vercel.com/dashboard
- **GitHub**: Create new repository as needed

## ⚠️ Important Notes

1. **Root Directory**: Must be set to `web/` in Vercel (not root of repo)
2. **Environment Variables**: Must be prefixed with `NEXT_PUBLIC_` for client-side access
3. **Supabase Access**: The anon key allows public read access - ensure RLS policies are configured if needed
4. **Auto-Deploy**: Vercel will auto-deploy on every push to main branch

## 🎉 You're Done!

Once deployed, your SEC scraper web app will be live at your Vercel URL, displaying real-time dilution alerts from Supabase.
