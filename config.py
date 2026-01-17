"""
SEC EDGAR Scraper Configuration

This module contains all configuration constants required for the SEC EDGAR scraper.
The SEC requires a proper User-Agent header for all requests to identify the requester.
"""

# SEC User-Agent requirement
# The SEC requires all requests to include a User-Agent header that identifies
# the requester (name and email). This is mandatory for compliance with SEC.gov
# terms of service.
SEC_HEADERS = {
    "User-Agent": "Short Seller Research Tool gdwoods@gmail.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

# Base URLs for SEC EDGAR endpoints
SEC_BASE_URL = "https://www.sec.gov"
COMPANY_TICKERS_URL = f"{SEC_BASE_URL}/files/company_tickers.json"
LATEST_FILINGS_JSON_URL = f"{SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&start=0&count=100&output=json"

# Form types that typically indicate potential dilution events
# S-1: Initial registration of securities
# S-3: Simplified registration for well-known seasoned issuers
# 424B4: Prospectus supplement
# 424B5: Prospectus supplement (often for shelf offerings)
# 8-K: Current report (may disclose financing arrangements)
RELEVANT_FORM_TYPES = [
    "S-1",
    "S-3",
    "424B4",
    "424B5",
    "8-K",
]

# Red Flag Keywords: Terms commonly associated with dilution events
# These keywords help identify filings that may involve:
# - Warrant exercises (dilutive securities)
# - Convertible debt/notes (conversion to equity)
# - ATM (At-the-market) offerings (continuous selling of shares)
# - Equity line of credit (pre-arranged equity sales)
# - Other dilutive financing mechanisms
RED_FLAG_KEYWORDS = [
    "warrant",
    "convertible note",
    "convertible debenture",
    "at-the-market",
    "atm offering",
    "equity line of credit",
    "equity line",
    "standby equity distribution agreement",
    "seda",
    "common stock purchase agreement",
    "equity purchase agreement",
    "preferred stock",
    "dilution",
    "anti-dilution",
    "full ratchet",
    "weighted average anti-dilution",
    "adjustable conversion price",
    "floor price adjustment",
    "resets",
    "toxic financing",
    "death spiral financing",
    "pipes",
    "private investment in public equity",
    "purchased shares",
    "commitment shares",
    "make-whole payment",
    "redemption premium",
    "variable rate",
    "floating conversion rate",
]

# Underwriters and Placement Agents: Firms known for structuring dilutive financings
# These firms often participate in transactions that may be red flags for short sellers
UNDERWRITERS = [
    "maxim",
    "wainwright",
    "aegis",
    "roth capital",
    "ladenburg thalmann",
    "network 1 financial",
    "westpark capital",
    "chardan capital",
    "ascendiant capital",
    "dawson james",
    "thinkequity",
    "noble financial",
    "collier securities",
    "ventures securities",
]

# SEC Rate Limiting
# The SEC allows approximately 10 requests per second per IP address
# We'll implement delays to respect these limits
SEC_REQUESTS_PER_SECOND = 10
SEC_REQUEST_DELAY = 0.1  # 100ms delay between requests (10 req/sec)

# File paths for data storage
UNIVERSE_CSV_PATH = "data/company_universe.csv"
DILUTION_ALERTS_CSV_PATH = "data/dilution_alerts.csv"
DATA_DIR = "data"

# Retry configuration for handling temporary SEC server errors
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds