"""
Filing Scanner: Polls SEC Latest Filings Feed

This module monitors the SEC's latest filings feed and filters for forms that
typically indicate potential dilution events (S-1, S-3, 424B4, 424B5, 8-K).
When relevant filings are found, they are enriched with ticker symbol lookups
from the company universe database.
"""

import json
import time
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import pandas as pd

from config import (
    SEC_HEADERS,
    SEC_BASE_URL,
    RELEVANT_FORM_TYPES,
    SEC_REQUEST_DELAY,
    MAX_RETRIES,
    RETRY_DELAY,
)
from universe_builder import get_ticker_from_cik


def fetch_latest_filings(count: int = 100) -> Optional[List[Dict]]:
    """
    Fetches the latest SEC filings from the official JSON endpoint.
    
    The SEC provides a JSON endpoint that returns recent filings across all companies.
    This is more efficient than parsing RSS feeds or HTML pages.
    
    Note: The SEC's JSON endpoint structure may vary. This function handles a common format.
    If the structure changes, this will need to be updated.
    
    Args:
        count: Maximum number of filings to fetch (default: 100)
        
    Returns:
        List of filing dictionaries, or None if fetch fails
        
    Raises:
        requests.RequestException: If the request fails after retries
    """
    # Construct URL - Note: SEC endpoint format may need adjustment based on actual API
    # Alternative: Use RSS feed at https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent
    url = f"{SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&start=0&count={count}&output=json"
    
    print(f"[Filing Scanner] Fetching latest {count} filings from SEC...")
    
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(SEC_REQUEST_DELAY)  # Respect rate limits
            
            response = requests.get(
                url,
                headers=SEC_HEADERS,
                timeout=30
            )
            
            if response.status_code == 200:
                # Parse JSON response
                # Note: SEC's JSON format may vary - adjust parsing as needed
                try:
                    data = response.json()
                    filings = data.get("directory", {}).get("item", [])
                    
                    # Normalize to list if single item
                    if not isinstance(filings, list):
                        filings = [filings] if filings else []
                    
                    print(f"[Filing Scanner] Successfully fetched {len(filings)} filings")
                    return filings
                except json.JSONDecodeError:
                    # If JSON parsing fails, try RSS feed as fallback
                    print(f"[Filing Scanner] JSON parsing failed, trying RSS feed fallback...")
                    return fetch_latest_filings_rss(count)
                    
            elif response.status_code == 429:
                wait_time = RETRY_DELAY * (attempt + 1)
                print(f"[Filing Scanner] Rate limited. Waiting {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"[Filing Scanner] Unexpected status code: {response.status_code}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
                    
        except requests.RequestException as e:
            print(f"[Filing Scanner] Request failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
    
    print(f"[Filing Scanner] JSON endpoint failed after {MAX_RETRIES} attempts, trying RSS feed fallback...")
    # Fall back to RSS feed if JSON endpoint fails
    return fetch_latest_filings_rss(count)


def fetch_latest_filings_rss(count: int = 100) -> Optional[List[Dict]]:
    """
    Fallback: Fetches latest filings from ATOM/RSS feed if JSON endpoint fails.
    
    The SEC provides an ATOM feed (XML-based, similar to RSS) which is more stable.
    We parse the ATOM XML and extract filing information.
    
    SEC ATOM feed: https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom
    
    Args:
        count: Maximum number of filings to fetch
        
    Returns:
        List of filing dictionaries, or None if fetch fails
    """
    import xml.etree.ElementTree as ET
    import re
    
    # Use ATOM feed (output=atom) instead of HTML page
    url = f"{SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&count={count}&output=atom"
    
    print(f"[Filing Scanner] Fetching from RSS feed (fallback)...")
    
    try:
        time.sleep(SEC_REQUEST_DELAY)
        response = requests.get(url, headers=SEC_HEADERS, timeout=30)
        
        if response.status_code == 200:
            # Check if response is actually XML/RSS (not HTML error page)
            content_type = response.headers.get("content-type", "").lower()
            content_text = response.text[:500]  # First 500 chars for inspection
            
            if "xml" not in content_type and "rss" not in content_type:
                # Might be HTML or plain text - check content
                if "<html" in content_text.lower() or "<!doctype" in content_text.lower():
                    print(f"[Filing Scanner] RSS feed returned HTML instead of XML (might be error page)")
                    return None
            
            # Parse ATOM XML
            try:
                root = ET.fromstring(response.content)
            except ET.ParseError as e:
                print(f"[Filing Scanner] XML parsing error: {e}")
                print(f"[Filing Scanner] Response preview: {content_text[:200]}")
                return None
            
            # ATOM structure: <feed><entry>...</entry></feed>
            # RSS structure: <rss><channel><item>...</item></channel></rss>
            # Try ATOM first, then RSS
            items = root.findall(".//{http://www.w3.org/2005/Atom}entry")  # ATOM namespace
            if not items:
                items = root.findall(".//entry")  # ATOM without namespace
            if not items:
                items = root.findall(".//item")  # RSS format
            filings = []
            atom_ns = "{http://www.w3.org/2005/Atom}"  # ATOM namespace prefix
            
            for item in items[:count]:
                # ATOM uses namespace-qualified elements
                # Direct children search (not descendant)
                title_elem = item.find(f"./{atom_ns}title")
                if title_elem is None:
                    title_elem = item.find("./title")
                link_elem = item.find(f"./{atom_ns}link")
                if link_elem is None:
                    link_elem = item.find("./link")
                pub_date_elem = item.find(f"./{atom_ns}updated")
                if pub_date_elem is None:
                    pub_date_elem = item.find("./pubDate") or item.find("./updated")
                description_elem = item.find(f"./{atom_ns}summary")
                if description_elem is None:
                    description_elem = item.find("./description") or item.find("./summary")
                category_elem = item.find(f"./{atom_ns}category")
                if category_elem is None:
                    category_elem = item.find("./category")
                
                # Extract text - handle None and empty text
                title_text = (title_elem.text if title_elem is not None and title_elem.text else "").strip()
                
                # For ATOM, link is an attribute href, not text content
                link_text = ""
                if link_elem is not None:
                    link_text = link_elem.get("href") or (link_elem.text if link_elem.text else "")
                
                pub_date_text = pub_date_elem.text if pub_date_elem is not None and pub_date_elem.text else ""
                description_text = description_elem.text if description_elem is not None and description_elem.text else ""
                
                # Extract form type from category term attribute (ATOM) or from title (RSS/fallback)
                form_type = None
                if category_elem is not None:
                    form_type = category_elem.get("term")  # ATOM stores form type in category term
                if not form_type:
                    # Fallback: Extract form type from title (e.g., "Form 8-K", "Form S-1")
                    form_type_match = re.search(r"Form\s+([A-Z0-9-]+)", title_text, re.IGNORECASE)
                    form_type = form_type_match.group(1) if form_type_match else None
                
                # Extract CIK from title or description or link
                # Common patterns:
                # - "(0001234567)" in title (parentheses - common in ATOM)
                # - "CIK: 0001234567" in title/description
                # - "cik=1234567" in URL
                cik_match = None
                # Try parentheses pattern first (common in ATOM titles: "4 - Company Name (0001234567)")
                cik_match = re.search(r"\((\d{10})\)", title_text) or re.search(r"\((\d+)\)", title_text)
                if not cik_match:
                    cik_match = re.search(r"CIK[:\s]+(\d+)", title_text + " " + description_text)
                if not cik_match:
                    cik_match = re.search(r"cik[=:](\d+)", link_text, re.IGNORECASE)
                
                filing = {
                    "title": title_text,
                    "link": link_text,
                    "pubDate": pub_date_text,
                    "cik": cik_match.group(1) if cik_match else None,
                    "form_type": form_type,  # Pre-extract form type from RSS
                }
                filings.append(filing)
            
            print(f"[Filing Scanner] Parsed {len(filings)} filings from RSS")
            return filings
            
    except Exception as e:
        print(f"[Filing Scanner] RSS parsing failed: {e}")
        import traceback
        traceback.print_exc()
    
    return None


def parse_filing_form_type(filing: Dict) -> Optional[str]:
    """
    Extracts the form type from a filing record.
    
    Form types are typically in the title or can be extracted from the filing URL.
    Common patterns:
    - "Form 8-K" in title
    - "S-1" in title
    - Form type in URL: /cgi-bin/viewer?action=view&cik=...&accession_number=...&xbrl_type=S-1
    
    Args:
        filing: Filing dictionary with title, link, etc.
        
    Returns:
        Form type string (e.g., "8-K", "S-1") or None if not found
    """
    title = filing.get("title", "").upper()
    link = filing.get("link", "").upper()
    
    # Check for form types in title
    for form_type in RELEVANT_FORM_TYPES:
        if form_type.upper() in title or f"FORM {form_type}" in title:
            return form_type
    
    # Check for form types in link/URL
    for form_type in RELEVANT_FORM_TYPES:
        if form_type.upper() in link:
            return form_type
    
    return None


def filter_relevant_filings(filings: List[Dict]) -> List[Dict]:
    """
    Filters filings to only include relevant form types.
    
    We only care about forms that typically indicate dilution events:
    S-1, S-3, 424B4, 424B5, 8-K
    
    Args:
        filings: List of all filing dictionaries
        
    Returns:
        Filtered list containing only relevant form types
    """
    relevant_filings = []
    
    for filing in filings:
        form_type = parse_filing_form_type(filing)
        
        if form_type and form_type.upper() in [f.upper() for f in RELEVANT_FORM_TYPES]:
            # Add form type to filing dict for easier access
            filing["form_type"] = form_type
            relevant_filings.append(filing)
    
    print(f"[Filing Scanner] Filtered to {len(relevant_filings)} relevant filings")
    return relevant_filings


def enrich_filings_with_tickers(filings: List[Dict], universe_df: pd.DataFrame) -> List[Dict]:
    """
    Enriches filing records with ticker symbols by looking up CIK in universe.
    
    SEC filings typically contain CIK numbers but not ticker symbols.
    We use the universe DataFrame to map CIK -> Ticker.
    
    Args:
        filings: List of filing dictionaries (should have 'cik' field)
        universe_df: DataFrame with CIK -> Ticker mappings
        
    Returns:
        List of enriched filing dictionaries with 'ticker' field added
    """
    enriched = []
    
    for filing in filings:
        cik = filing.get("cik")
        
        if cik:
            ticker = get_ticker_from_cik(cik, universe_df)
            filing["ticker"] = ticker if ticker else "UNKNOWN"
        else:
            filing["ticker"] = "UNKNOWN"
        
        enriched.append(filing)
    
    return enriched


def scan_filings_by_form_type(form_type: str, count: int = 100, days_back: Optional[int] = None) -> Optional[List[Dict]]:
    """
    Scans SEC filings filtered by a specific form type.
    
    This is more efficient than scanning all filings and filtering,
    as the SEC API supports filtering by form type.
    
    Args:
        form_type: Form type to search for (e.g., "8-K", "S-1")
        count: Maximum number of filings to fetch
        days_back: Optional number of days to look back (filters filings by date)
        
    Returns:
        List of filing dictionaries, or None if fetch fails
    """
    import xml.etree.ElementTree as ET
    import re
    
    # Use ATOM feed with form type filter
    url = f"{SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type={form_type}&count={count}&output=atom"
    
    print(f"[Filing Scanner] Fetching {form_type} filings from SEC...")
    
    try:
        time.sleep(SEC_REQUEST_DELAY)
        response = requests.get(url, headers=SEC_HEADERS, timeout=30)
        
        if response.status_code == 200:
            # Parse ATOM XML
            try:
                root = ET.fromstring(response.content)
            except ET.ParseError as e:
                print(f"[Filing Scanner] XML parsing error: {e}")
                return None
            
            # Find entries
            atom_ns = "{http://www.w3.org/2005/Atom}"
            items = root.findall(f".//{atom_ns}entry")
            if not items:
                items = root.findall(".//entry")
            
            filings = []
            
            for item in items[:count]:
                title_elem = item.find(f"./{atom_ns}title")
                if title_elem is None:
                    title_elem = item.find("./title")
                link_elem = item.find(f"./{atom_ns}link")
                if link_elem is None:
                    link_elem = item.find("./link")
                pub_date_elem = item.find(f"./{atom_ns}updated")
                if pub_date_elem is None:
                    pub_date_elem = item.find("./pubDate") or item.find("./updated")
                category_elem = item.find(f"./{atom_ns}category")
                if category_elem is None:
                    category_elem = item.find("./category")
                
                title_text = (title_elem.text if title_elem is not None and title_elem.text else "").strip()
                link_text = ""
                if link_elem is not None:
                    link_text = link_elem.get("href") or (link_elem.text if link_elem.text else "")
                pub_date_text = pub_date_elem.text if pub_date_elem is not None and pub_date_elem.text else ""
                
                # Extract form type from category
                extracted_form_type = category_elem.get("term") if category_elem is not None else form_type
                
                # Extract CIK from title
                cik_match = re.search(r"\((\d{10})\)", title_text) or re.search(r"\((\d+)\)", title_text)
                if not cik_match:
                    cik_match = re.search(r"CIK[:\s]+(\d+)", title_text)
                if not cik_match:
                    cik_match = re.search(r"cik[=:](\d+)", link_text, re.IGNORECASE)
                
                # Filter by date if days_back is specified
                if days_back is not None:
                    try:
                        from dateutil import parser as date_parser
                        filing_date = date_parser.parse(pub_date_text)
                        cutoff_date = datetime.now() - timedelta(days=days_back)
                        if filing_date < cutoff_date:
                            continue  # Skip filing if too old
                    except (ValueError, TypeError):
                        # If date parsing fails, include the filing (better to include than exclude)
                        pass
                
                filing = {
                    "title": title_text,
                    "link": link_text,
                    "pubDate": pub_date_text,
                    "cik": cik_match.group(1) if cik_match else None,
                    "form_type": extracted_form_type,
                }
                filings.append(filing)
            
            print(f"[Filing Scanner] Found {len(filings)} {form_type} filings")
            return filings
            
    except Exception as e:
        print(f"[Filing Scanner] Error fetching {form_type} filings: {e}")
        return None
    
    return None


def scan_latest_filings(universe_df: pd.DataFrame, count: int = 100) -> List[Dict]:
    """
    Main function: Scans latest SEC filings for relevant dilution events.
    
    This function orchestrates the entire filing scan process:
    1. Fetches latest filings from SEC
    2. Filters for relevant form types
    3. Enriches with ticker symbols from universe
    
    Args:
        universe_df: DataFrame with company universe for ticker lookups
        count: Maximum number of filings to fetch and process
        
    Returns:
        List of enriched, filtered filing dictionaries
    """
    print("=" * 60)
    print("Filing Scanner - Scanning Latest SEC Filings")
    print("=" * 60)
    
    # Fetch latest filings
    filings = fetch_latest_filings(count)
    
    if filings is None:
        print("[Filing Scanner] No filings fetched")
        return []
    
    # Filter for relevant forms
    relevant_filings = filter_relevant_filings(filings)
    
    # Enrich with ticker symbols
    enriched_filings = enrich_filings_with_tickers(relevant_filings, universe_df)
    
    print(f"[Filing Scanner] Scan complete: {len(enriched_filings)} relevant filings found")
    
    return enriched_filings


if __name__ == "__main__":
    # Test the filing scanner
    from universe_builder import build_or_load_universe
    
    print("=" * 60)
    print("Filing Scanner - Test Run")
    print("=" * 60)
    
    # Load universe for ticker lookups
    universe_df = build_or_load_universe(force_refresh=False)
    
    if universe_df is None:
        print("❌ Cannot test filing scanner without universe data")
    else:
        # Scan for filings
        filings = scan_latest_filings(universe_df, count=50)
        
        if filings:
            print(f"\n✅ Filing scanner test successful!")
            print(f"   Found {len(filings)} relevant filings")
            print(f"\n   Sample filings:")
            for filing in filings[:5]:
                print(f"     - {filing.get('ticker', 'UNKNOWN')}: {filing.get('form_type')} - {filing.get('title', 'N/A')[:60]}")
        else:
            print("\n⚠️  No relevant filings found in test run")