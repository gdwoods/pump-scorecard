"""
Price Filter: Filters filings by stock price

This module provides functions to check stock prices and filter filings
to only those with share prices under a specified threshold (e.g., $10).
"""

import time
import requests
from typing import Optional, Dict
import re

from config import SEC_HEADERS, SEC_REQUEST_DELAY, MAX_RETRIES, RETRY_DELAY


def fetch_share_price_from_filing(filing_text: str) -> Optional[float]:
    """
    Extracts share price from filing text (fast, before full parsing).
    
    This is a quick check to extract share price without full document parsing.
    Looks for patterns like "$10.00 per share" or "offering price of $10.00"
    
    Args:
        filing_text: Filing document text content
        
    Returns:
        Share price as float, or None if not found
    """
    # Clean up text for matching
    text_clean = re.sub(r'&[#\w]+;', ' ', filing_text[:100000])  # First 100k chars should be enough
    text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
    text_clean = re.sub(r'\s+', ' ', text_clean)
    
    # Patterns for share price - prioritize common ones
    price_patterns = [
        r'offering\s+price[:\s]*\$?([\d\.]+)',
        r'\$([\d\.]+)\s+per\s+share',
        r'price\s+of\s+\$?([\d\.]+)',
        r'initial\s+public\s+offering\s+price[:\s]*\$?([\d\.]+)',
    ]
    
    for pattern in price_patterns:
        match = re.search(pattern, text_clean, re.IGNORECASE)
        if match:
            try:
                price = float(match.group(1))
                # Validate it's a reasonable price (not a percentage or other number)
                if 0.01 <= price <= 1000:
                    return price
            except ValueError:
                continue
    
    return None


def fetch_current_stock_price(ticker: str) -> Optional[float]:
    """
    Fetches current stock price from Yahoo Finance or other free API.
    
    This is a fallback if we can't extract price from filing.
    Uses a simple HTTP request to get current price.
    
    Args:
        ticker: Stock ticker symbol
        
    Returns:
        Current stock price as float, or None if fetch fails
    """
    # Try Yahoo Finance quote endpoint (simple HTML scraping)
    url = f"https://finance.yahoo.com/quote/{ticker}"
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            # Extract price from HTML - look for price element
            # Yahoo Finance stores price in various places, try common patterns
            price_match = re.search(r'"regularMarketPrice":{"raw":([\d\.]+)', response.text)
            if price_match:
                try:
                    return float(price_match.group(1))
                except ValueError:
                    pass
            
            # Fallback: look for price in meta tags or other locations
            price_match = re.search(r'<span[^>]*>(\$)?([\d,\.]+)<\/span>', response.text)
            if price_match:
                try:
                    price_str = price_match.group(2).replace(',', '')
                    return float(price_str)
                except ValueError:
                    pass
    except Exception as e:
        # Silently fail - price lookup is optional
        pass
    
    return None


def check_filing_price_filter(filing: Dict, max_price: float = 10.0) -> Optional[float]:
    """
    Checks if a filing's stock price is under the max price threshold.
    
    This function tries to get the share price from:
    1. Filing text (if already fetched)
    2. Current stock price lookup (fallback)
    
    Args:
        filing: Filing dictionary with ticker and optionally filing_text
        max_price: Maximum price threshold (default: $10.00)
        
    Returns:
        Share price if found and under threshold, None if over threshold or not found
    """
    ticker = filing.get("ticker", "").upper()
    
    if not ticker or ticker == "UNKNOWN":
        # Can't check price without ticker
        return None
    
    # Try to extract price from filing text if available
    filing_text = filing.get("filing_text")
    share_price = None
    
    if filing_text:
        share_price = fetch_share_price_from_filing(filing_text)
    
    # If we didn't get price from filing, try current price lookup
    if share_price is None:
        share_price = fetch_current_stock_price(ticker)
    
    # Filter: return price only if under threshold
    if share_price is not None and share_price < max_price:
        return share_price
    
    return None


def filter_filings_by_price(filings: list, max_price: float = 10.0, fetch_prices: bool = True) -> list:
    """
    Filters a list of filings to only those with share prices under max_price.
    
    This function:
    1. Extracts share price from filing text if available
    2. Falls back to current price lookup if needed
    3. Filters to only filings with price < max_price
    
    Args:
        filings: List of filing dictionaries
        max_price: Maximum price threshold (default: $10.00)
        fetch_prices: If True, fetch current prices for filings without price in text
        
    Returns:
        Filtered list of filings with share prices under max_price
    """
    filtered_filings = []
    
    print(f"[Price Filter] Filtering filings by price (max: ${max_price:.2f})...")
    
    for filing in filings:
        ticker = filing.get("ticker", "").upper()
        
        if not ticker or ticker == "UNKNOWN":
            # Skip if no ticker (can't check price)
            continue
        
        # Check price
        price = check_filing_price_filter(filing, max_price=max_price)
        
        if price is not None:
            # Add price to filing dict
            filing["share_price_filter"] = price
            filtered_filings.append(filing)
        else:
            # Log why it was filtered out
            if price is None:
                pass  # Price not found - likely filtered out
            # else: price was >= max_price, which is fine to filter
    
    print(f"[Price Filter] Filtered to {len(filtered_filings)} filings with price < ${max_price:.2f} (from {len(filings)} total)")
    
    return filtered_filings


if __name__ == "__main__":
    # Test the price filter
    test_filing = {
        "ticker": "HLXC",
        "form_type": "S-1/A",
        "filing_text": "initial public offering price of $10.00 per share",
    }
    
    print("Testing price filter...")
    price = check_filing_price_filter(test_filing, max_price=10.0)
    print(f"Price check result: {price}")
    
    # Test with a higher price
    test_filing2 = {
        "ticker": "AAPL",
        "form_type": "S-1",
    }
    price2 = check_filing_price_filter(test_filing2, max_price=10.0)
    print(f"AAPL price check result: {price2}")
