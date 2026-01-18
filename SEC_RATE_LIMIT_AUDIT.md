# SEC Rate Limit & Retry Logic Audit

## Current Configuration

- **SEC_REQUEST_DELAY**: `0.1` seconds (100ms) = 10 requests/second ✅
- **MAX_RETRIES**: `3` attempts ✅
- **RETRY_DELAY**: `2` seconds (base), increases with each retry ✅

## Request Locations with Delays & Retries

### ✅ **filing_scanner.py** - `fetch_latest_filings()`
- **Delay**: ✅ `time.sleep(SEC_REQUEST_DELAY)` before request (line 55)
- **Retry**: ✅ `for attempt in range(MAX_RETRIES)` with exponential backoff (lines 53-97)
- **Rate Limit Handling**: ✅ 429 status code handled with `RETRY_DELAY * (attempt + 1)` (lines 82-84)

### ✅ **filing_scanner.py** - `fetch_latest_filings_rss()`
- **Delay**: ✅ `time.sleep(SEC_REQUEST_DELAY)` before request (line 124)
- **Retry**: ⚠️ No retry loop (single try-catch), but this is a fallback method

### ✅ **filing_scanner.py** - `scan_filings_by_form_type()`
- **Delay**: ✅ `time.sleep(SEC_REQUEST_DELAY)` before request (line 342)
- **Retry**: ⚠️ No retry loop, but called from main flow which may have retries

### ✅ **filing_parser.py** - `get_primary_document_url_from_index()`
- **Delay**: ✅ `time.sleep(SEC_REQUEST_DELAY)` before request (line 62)
- **Retry**: ❌ No retry loop (single try-catch)

### ✅ **filing_parser.py** - `fetch_filing_document()`
- **Delay**: ✅ `time.sleep(SEC_REQUEST_DELAY)` before each attempt (line 149)
- **Retry**: ✅ `for attempt in range(MAX_RETRIES)` with exponential backoff (lines 147-188)
- **Rate Limit Handling**: ✅ 429 status code handled (lines 174-177)

### ✅ **filing_parser.py** - `find_original_s1_filing()`
- **Delay**: ✅ `time.sleep(SEC_REQUEST_DELAY)` before request (line 835)
- **Retry**: ❌ No retry loop (single try-catch)

### ✅ **universe_builder.py** - `fetch_company_tickers()`
- **Delay**: ✅ `time.sleep(SEC_REQUEST_DELAY)` implicitly via retry loop
- **Retry**: ✅ `for attempt in range(MAX_RETRIES)` with exponential backoff (lines 34-61)
- **Rate Limit Handling**: ✅ 429/503 status codes handled (lines 49-56)

### ✅ **analyzer.py** - Document fetching
- **Delay**: ✅ `time.sleep(SEC_REQUEST_DELAY * 2)` between filings (line 494)
  - Note: Longer delay for document fetches (200ms instead of 100ms)
- **Retry**: ✅ Handled by `filing_parser.fetch_filing_document()` which has retries

### ⚠️ **price_filter.py** - `fetch_current_stock_price()`
- **Delay**: ❓ Not explicitly checked (Yahoo Finance, not SEC)
- **Retry**: ❌ No retry loop
- **Note**: This is Yahoo Finance, not SEC, so different rate limits apply

## Recommendations

### 1. Add Retry Logic to Missing Functions

**Priority 1: Critical paths without retries**
- `get_primary_document_url_from_index()` - Called frequently during document fetching
- `find_original_s1_filing()` - Used when S-1/A amendments need original filing

**Priority 2: Fallback methods**
- `fetch_latest_filings_rss()` - Already a fallback, but should have retries for robustness

### 2. Delay Consistency

✅ **Good**: Most functions use `SEC_REQUEST_DELAY = 0.1s` (10 req/sec)
✅ **Good**: `analyzer.py` uses `SEC_REQUEST_DELAY * 2` (200ms) for document fetches (more conservative)

### 3. Current Compliance Status

**Overall**: ✅ **COMPLIANT** - Main request paths have delays and retries

**Areas for improvement**:
1. Add retry loops to `get_primary_document_url_from_index()` and `find_original_s1_filing()`
2. Add retry loop to `fetch_latest_filings_rss()` fallback method

## Testing Recommendations

1. Monitor for 429 (Too Many Requests) errors in logs
2. If 429 errors occur, increase `SEC_REQUEST_DELAY` from `0.1` to `0.15` or `0.2`
3. Check GitHub Actions logs for rate limit warnings
