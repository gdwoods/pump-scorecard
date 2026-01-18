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
# EFFECT: Notice of effectiveness - indicates a registration statement (S-1/S-3) has become effective
#         and the company can now sell the registered securities
RELEVANT_FORM_TYPES = [
    "S-1",
    "S-3",
    "424B4",
    "424B5",
    "8-K",
    "EFFECT",
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

# High-risk underwriters (+2 points when found)
HIGH_RISK_UNDERWRITERS = [
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
    # New additions (2024-2025 deal flow)
    "univest securities",
    "ef hutton",  # EF Hutton / Benchmark (same ecosystem)
    "benchmark company",  # EF Hutton / Benchmark (same ecosystem)
    "benchmark",  # Catch standalone "Benchmark" references
    "joseph gunnar",
    "spartan capital",
    "dominion capital",
    "kingswood capital",
    "laidlaw",
    "laidlaw & company",
]

# Medium-risk underwriters (+1 point, unless toxic terms present, then +2)
# These are larger banks but have specific desks that do aggressive financing
MEDIUM_RISK_UNDERWRITERS = [
    "cantor",  # Cantor Fitzgerald - larger bank but has aggressive SPAC/Biotech desk
    "cantor fitzgerald",
]

# Lower-risk underwriters (0 points when alone, but don't override high-risk co-managers)
# These are legitimate mid-market banks that often lead quality small-cap deals
# However, if they co-manage with high-risk underwriters, the high-risk underwriter's score takes precedence
LOWER_RISK_UNDERWRITERS = [
    "oppenheimer",
    "william blair",
]

# Combined list for search (all underwriters to search for)
UNDERWRITERS = HIGH_RISK_UNDERWRITERS + MEDIUM_RISK_UNDERWRITERS + LOWER_RISK_UNDERWRITERS

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