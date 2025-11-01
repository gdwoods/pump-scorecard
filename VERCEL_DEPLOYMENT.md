# Vercel Deployment Guide for Short Check

## 🔑 Environment Variables

Set these in **Vercel Dashboard → Project Settings → Environment Variables**:

### Required:
- `GOOGLE_CLOUD_VISION_API_KEY` - Your Google Cloud Vision API key for OCR processing
  - Get it from: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  - Enable the "Cloud Vision API" in your project
  - Create an API key (restrict it to Vision API for security)

### Optional:
- `POLYGON_API_KEY` - For enhanced options/contracts data (if you have Polygon.io subscription)
  - Without this, the app will fall back to Yahoo Finance for options detection

## ⚠️ Critical Configuration

### 1. File Upload Size Limits

**Current Issue**: Your code validates 10MB max, but Vercel has a **4.5MB limit** for serverless function request bodies.

**Solutions**:

**Option A: Use Vercel Blob Storage (Recommended)**
```typescript
// Install: npm install @vercel/blob
// Upload file to Vercel Blob first, then process from URL
```

**Option B: Reduce Client-Side Limit**
Update `app/api/short-check/route.ts`:
```typescript
const maxSize = 4 * 1024 * 1024; // 4MB (safe margin under 4.5MB)
```

**Option C: Use Edge Runtime with FormData streaming** (Advanced)

### 2. Function Timeout Configuration

✅ **Already Configured**: Your `app/api/short-check/route.ts` has:
```typescript
export const maxDuration = 60; // 60 seconds
```

**Vercel Limits**:
- **Free Tier**: 10 seconds max
- **Pro Tier**: 60 seconds max ✅ (you need Pro for OCR)
- **Enterprise**: 300 seconds

**Recommendation**: Upgrade to **Vercel Pro** ($20/month) for:
- 60s timeout (needed for OCR processing)
- Higher bandwidth limits
- Better performance

### 3. Runtime Configuration

✅ **Already Set**: Your API routes use `export const runtime = 'nodejs'`

This is correct for:
- Google Cloud Vision SDK
- Sharp image processing
- File uploads

## 📦 Build Configuration

### Next.js Config ✅
Your `next.config.ts` is already optimized:
- `outputFileTracingRoot` set correctly
- TypeScript/ESLint errors ignored during builds (good for deployment)

### Dependencies Check ✅
All dependencies are compatible with Vercel:
- `sharp` - ✅ Native binaries work on Vercel
- `@google-cloud/vision` - ✅ Works with API key auth
- `yahoo-finance2` - ✅ No issues
- `recharts` - ✅ Client-side only

## 🚀 Deployment Steps

### 1. Connect Repository
```bash
# In Vercel Dashboard:
# 1. Click "Add New Project"
# 2. Import your Git repository
# 3. Vercel will auto-detect Next.js
```

### 2. Set Environment Variables
```bash
# In Vercel Dashboard → Settings → Environment Variables:
GOOGLE_CLOUD_VISION_API_KEY=your-api-key-here
POLYGON_API_KEY=your-polygon-key-here  # Optional
```

**Important**: Set for all environments (Production, Preview, Development)

### 3. Configure Build Settings
```bash
# Vercel will auto-detect, but verify:
Framework Preset: Next.js
Build Command: next build
Output Directory: .next
Install Command: npm install
```

### 4. Deploy
```bash
# Option A: Push to main branch (auto-deploys)
git push origin main

# Option B: Deploy via CLI
npm i -g vercel
vercel --prod
```

## 🔍 Post-Deployment Checklist

### 1. Test OCR Functionality
- Upload a test screenshot to `/` (Short Check)
- Verify OCR processing works
- Check Vercel function logs for errors

### 2. Test API Routes
- `/api/short-check` - POST with image
- `/api/short-check` - PUT with manual data
- `/api/scan/[ticker]` - GET for Pump Scorecard
- `/api/export-pdf/[ticker]` - GET for PDF export

### 3. Monitor Function Logs
```bash
# In Vercel Dashboard → Functions tab
# Watch for:
# - Timeout errors (if > 10s on free tier)
# - Memory errors (if image processing fails)
# - API key errors (if GOOGLE_CLOUD_VISION_API_KEY missing)
```

### 4. Check Function Metrics
- **Duration**: Should be < 60s for OCR
- **Memory**: Should be < 1024MB (default)
- **Invocations**: Monitor usage

## ⚡ Performance Optimizations

### 1. Image Processing
✅ Already optimized with `sharp` preprocessing before OCR

### 2. Caching
Consider adding caching headers:
```typescript
// In API routes
export const revalidate = 3600; // Cache for 1 hour
```

### 3. Edge Functions (Future)
For faster responses, consider moving image validation to Edge:
```typescript
export const runtime = 'edge'; // Faster, but limited APIs
```

## 🐛 Common Issues & Solutions

### Issue: "Function Timeout"
**Solution**: Upgrade to Vercel Pro for 60s timeout

### Issue: "Request body too large"
**Solution**: Reduce max file size to 4MB or use Vercel Blob

### Issue: "Google Cloud Vision API error"
**Solution**: 
- Verify API key is set correctly
- Check API is enabled in Google Cloud Console
- Verify billing is enabled (Vision API requires billing)

### Issue: "Sharp module not found"
**Solution**: Already handled - `sharp` is in dependencies ✅

### Issue: "Environment variable not found"
**Solution**: 
- Set in Vercel Dashboard → Settings → Environment Variables
- Redeploy after adding variables
- Check variable names match exactly (case-sensitive)

## 💰 Cost Considerations

### Vercel Pricing
- **Free**: 10s timeout, 100GB bandwidth
- **Pro ($20/mo)**: 60s timeout, 1TB bandwidth ✅ **Recommended**
- **Enterprise**: Custom limits

### Google Cloud Vision API
- **First 1,000 requests/month**: Free
- **After that**: ~$1.50 per 1,000 requests
- Estimate: ~$5-50/month depending on usage

### Estimated Monthly Costs
- Vercel Pro: $20
- Google Vision API: $5-50
- **Total**: ~$25-70/month

## 🔒 Security Best Practices

### 1. API Key Restrictions
In Google Cloud Console:
- Restrict API key to "Cloud Vision API" only
- Add HTTP referrer restrictions (your Vercel domain)
- Rotate keys regularly

### 2. Environment Variables
- Never commit `.env` files ✅ (already in .gitignore)
- Use Vercel's encrypted environment variables
- Different keys for Production/Preview/Development

### 3. Rate Limiting
Consider adding rate limiting for production:
```typescript
// Use Vercel Edge Config or Upstash Redis
// Limit: 10 requests per IP per minute
```

## 📊 Monitoring

### Vercel Analytics
Enable in Vercel Dashboard → Analytics tab:
- Function execution times
- Error rates
- Request volumes

### Logging
```bash
# View logs in Vercel Dashboard → Functions → Logs
# Or via CLI:
vercel logs [deployment-url]
```

## 🎯 Quick Deploy Checklist

- [ ] Repository connected to Vercel
- [ ] `GOOGLE_CLOUD_VISION_API_KEY` set in environment variables
- [ ] `POLYGON_API_KEY` set (optional)
- [ ] Vercel Pro plan active (for 60s timeout)
- [ ] File size limit reduced to 4MB (or Vercel Blob implemented)
- [ ] Test deployment on preview branch
- [ ] Verify OCR works in production
- [ ] Monitor function logs for errors
- [ ] Set up custom domain (optional)

## 🆘 Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Function Limits](https://vercel.com/docs/functions/runtimes/node-js#limitations)
- [Google Cloud Vision API](https://cloud.google.com/vision/docs)

---

**Ready to deploy?** Run `vercel --prod` or push to main branch! 🚀

