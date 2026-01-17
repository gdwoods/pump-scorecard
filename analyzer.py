"""
Analyzer: Analyzes SEC Filings for Dilution Red Flags

This module fetches the raw text content of SEC filings and searches for:
1. Red flag keywords (warrants, convertible notes, ATM offerings, etc.)
2. Problematic underwriters (Maxim, Wainwright, Aegis, etc.)

It calculates a risk score and identifies specific red flags present in each filing.
"""

import time
import requests
import re
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

from config import (
    SEC_HEADERS,
    SEC_BASE_URL,
    RED_FLAG_KEYWORDS,
    UNDERWRITERS,
    SEC_REQUEST_DELAY,
    MAX_RETRIES,
    RETRY_DELAY,
)
from signal_extractor import SignalExtractor


def extract_accession_number_from_url(filing_url: str) -> Optional[str]:
    """
    Extracts the accession number from a SEC filing URL.
    
    SEC filing URLs typically follow this pattern:
    /cgi-bin/viewer?action=view&cik=1234567&accession_number=0001234567-21-000123&xbrl_type=S-1
    
    The accession number is needed to construct the direct document URL.
    
    Args:
        filing_url: URL to the SEC filing viewer page
        
    Returns:
        Accession number string, or None if not found
    """
    # Try to extract from query parameters
    if "accession_number" in filing_url:
        match = re.search(r"accession_number=([^&]+)", filing_url)
        if match:
            return match.group(1)
    
    # Alternative: Try to extract from path or other URL components
    # SEC URLs can vary, so this may need adjustment based on actual format
    
    return None


def get_filing_document_url(filing: Dict) -> Optional[str]:
    """
    Constructs the direct URL to the filing document text.
    
    SEC filings are stored as text or HTML files. We need to:
    1. Extract accession number from the filing URL
    2. Construct the document URL (typically ends in .txt or .htm)
    
    Example URL pattern:
    https://www.sec.gov/Archives/edgar/data/320193/000032019321000123/0000320193-21-000123.txt
    
    Args:
        filing: Filing dictionary with 'link' or 'url' field
        
    Returns:
        Direct URL to the filing document, or None if construction fails
    """
    filing_url = filing.get("link") or filing.get("url", "")
    
    if not filing_url:
        return None
    
    # Extract accession number
    accession = extract_accession_number_from_url(filing_url)
    
    if not accession:
        # Fallback: Try to parse from URL or filing data directly
        # This may need adjustment based on actual SEC URL structure
        return filing_url
    
    # Extract CIK from URL or filing data
    cik_match = re.search(r"cik[=:](\d+)", filing_url.lower())
    cik = cik_match.group(1) if cik_match else filing.get("cik", "")
    
    if not cik:
        return filing_url  # Return original URL as fallback
    
    # Normalize CIK (remove leading zeros for path, but keep for accession)
    cik_numeric = cik.lstrip("0")
    
    # Construct document URL
    # Format: /Archives/edgar/data/{cik}/{accession_without_dashes}/{accession}.txt
    accession_clean = accession.replace("-", "")
    doc_url = f"{SEC_BASE_URL}/Archives/edgar/data/{cik_numeric}/{accession_clean}/{accession}.txt"
    
    return doc_url


def fetch_filing_text(filing: Dict) -> Optional[str]:
    """
    Fetches the raw text content of a SEC filing document.
    
    This function first checks if the filing already has the document text
    (e.g., from filing_parser), and if not, uses the filing_parser's
    fetch_filing_document function to get the full document.
    
    Args:
        filing: Filing dictionary with URL information
        
    Returns:
        Raw text content of the filing, or None if fetch fails
    """
    # Check if filing text is already available (from filing_parser)
    if filing.get("filing_text"):
        print(f"[Analyzer] Using pre-fetched filing text ({len(filing['filing_text'])} characters)")
        return filing["filing_text"]
    
    # Use filing_parser's fetch_filing_document to get the full document
    # This correctly handles index.htm pages and extracts the primary document
    from filing_parser import fetch_filing_document
    filing_text = fetch_filing_document(filing)
    
    if filing_text:
        # Store it in the filing dict for potential reuse
        filing["filing_text"] = filing_text
    
    return filing_text


def search_for_keywords(text: str, keywords: List[str]) -> Set[str]:
    """
    Searches text for keywords (case-insensitive) and returns matches.
    
    We search for keywords in the raw filing text. This helps identify
    specific dilution mechanisms mentioned in the filing.
    
    Args:
        text: Text content to search
        keywords: List of keywords to search for
        
    Returns:
        Set of keywords that were found in the text
    """
    if not text:
        return set()
    
    text_lower = text.lower()
    found_keywords = set()
    
    for keyword in keywords:
        # Use word boundaries to avoid partial matches
        # Example: "warrant" should match "warrant" but not "warranted"
        pattern = r"\b" + re.escape(keyword.lower()) + r"\b"
        if re.search(pattern, text_lower, re.IGNORECASE):
            found_keywords.add(keyword)
    
    return found_keywords


def search_for_underwriters(text: str, underwriters: List[str]) -> Set[str]:
    """
    Searches text for underwriter names in specific offering/underwriting contexts.
    
    Underwriters must appear near context words like "underwriter", "placement agent",
    "as agent", etc. This prevents false positives from mentions in other contexts
    (e.g., "maximum" matching "maxim", or "Roth IRA" matching "Roth Capital").
    
    Args:
        text: Text content to search
        underwriters: List of underwriter names to search for
        
    Returns:
        Set of underwriter names that were found in relevant contexts
    """
    if not text:
        return set()
    
    text_lower = text.lower()
    found_underwriters = set()
    
    # Context words that indicate the underwriter is actually serving as an underwriter
    context_patterns = [
        r"as\s+(?:our\s+)?(?:exclusive\s+)?underwriter",
        r"as\s+(?:our\s+)?(?:exclusive\s+)?placement\s+agent",
        r"as\s+(?:our\s+)?(?:exclusive\s+)?sales\s+agent",
        r"underwritten\s+by",
        r"underwritten\s+exclusively\s+by",
        r"placement\s+agent\s+is",
        r"underwriter\s+(?:is|of|for|,\s*)",
        r"acting\s+as\s+(?:our\s+)?(?:exclusive\s+)?underwriter",
        r"serving\s+as\s+(?:our\s+)?(?:exclusive\s+)?underwriter",
        r"our\s+underwriter",
        r"the\s+underwriter",
        r"underwriting\s+agreement",
        r"underwriting\s+fee",
        r"underwriting\s+discount",
    ]
    
    # Compile context patterns
    context_regexes = [re.compile(pattern, re.IGNORECASE) for pattern in context_patterns]
    
    for underwriter in underwriters:
        # Escape the underwriter name for regex
        underwriter_escaped = re.escape(underwriter.lower())
        
        # Search for underwriter name with word boundaries (avoid partial matches)
        # e.g., "maxim" should NOT match "maximum" or "maximize"
        underwriter_pattern = r"\b" + underwriter_escaped + r"\b"
        
        # Check if underwriter name appears in the text
        underwriter_matches = list(re.finditer(underwriter_pattern, text_lower, re.IGNORECASE))
        
        if not underwriter_matches:
            continue
        
        # Check if any match is near a context word (within 200 characters)
        for match in underwriter_matches:
            match_start = match.start()
            match_end = match.end()
            
            # Search for context patterns within 200 chars before or after the match
            context_window_start = max(0, match_start - 200)
            context_window_end = min(len(text_lower), match_end + 200)
            context_window = text_lower[context_window_start:context_window_end]
            
            # Check if any context pattern appears in the window
            for context_regex in context_regexes:
                if context_regex.search(context_window):
                    found_underwriters.add(underwriter)
                    break  # Found context, no need to check other contexts
            
            if underwriter in found_underwriters:
                break  # Already found this underwriter, move to next
        
        # Special case: If underwriter appears in "Company Name, LLC" format near context
        # Some filings list underwriters as "Company Name, LLC, as underwriter"
        company_name_pattern = r"\b" + underwriter_escaped + r"\s+(?:group|capital|partners|securities|llc|inc|ltd|corp)\b"
        if re.search(company_name_pattern, text_lower, re.IGNORECASE):
            # Check if it's near context words (same 200 char window check as above)
            company_matches = list(re.finditer(company_name_pattern, text_lower, re.IGNORECASE))
            for match in company_matches:
                match_start = match.start()
                match_end = match.end()
                context_window_start = max(0, match_start - 200)
                context_window_end = min(len(text_lower), match_end + 200)
                context_window = text_lower[context_window_start:context_window_end]
                
                for context_regex in context_regexes:
                    if context_regex.search(context_window):
                        found_underwriters.add(underwriter)
                        break
    
    return found_underwriters


def calculate_risk_score(found_keywords: Set[str], found_underwriters: Set[str]) -> int:
    """
    Calculates a risk score based on red flags found in the filing.
    
    Risk scoring logic:
    - Each red flag keyword found: +1 point
    - Each problematic underwriter found: +2 points
    - Higher score = higher risk of dilution
    
    This is a simple scoring mechanism. You can adjust the weights
    or add more sophisticated logic based on your research needs.
    
    Args:
        found_keywords: Set of red flag keywords found
        found_underwriters: Set of underwriters found
        
    Returns:
        Integer risk score (higher = more risky)
    """
    keyword_score = len(found_keywords)
    underwriter_score = len(found_underwriters) * 2  # Underwriters weighted more heavily
    
    total_score = keyword_score + underwriter_score
    
    return total_score


def fetch_filing_text(filing: Dict) -> Optional[str]:
    """
    Fetches the raw text content of a SEC filing document.
    
    This function first checks if the filing already has the document text
    (e.g., from filing_parser), and if not, uses the filing_parser's
    fetch_filing_document function to get the full document.
    
    Args:
        filing: Filing dictionary with URL information
        
    Returns:
        Raw text content of the filing, or None if fetch fails
    """
    # Check if filing text is already available (from filing_parser)
    if filing.get("filing_text"):
        print(f"[Analyzer] Using pre-fetched filing text ({len(filing['filing_text'])} characters)")
        return filing["filing_text"]
    
    # Use filing_parser's fetch_filing_document to get the full document
    from filing_parser import fetch_filing_document
    filing_text = fetch_filing_document(filing)
    
    if filing_text:
        # Store it in the filing dict for potential reuse
        filing["filing_text"] = filing_text
    
    return filing_text


def analyze_filing(filing: Dict) -> Dict:
    """
    Main function: Analyzes a single filing for dilution red flags.
    
    This function:
    1. Fetches the filing text
    2. Searches for red flag keywords
    3. Searches for problematic underwriters
    4. Extracts short seller signals (offering amount, toxic debt, resignations, warrants)
    5. Calculates a risk score
    6. Returns an analysis result dictionary
    
    Args:
        filing: Filing dictionary with URL and metadata
        
    Returns:
        Dictionary containing analysis results:
        {
            "warrants_found": bool,
            "red_flags_found": set of keywords,
            "underwriters_found": set of underwriters,
            "risk_score": int,
            "has_red_flags": bool,
            "short_seller_signals": dict with offering_amount, high_interest_debt, etc.
        }
    """
    ticker = filing.get("ticker", "UNKNOWN")
    form_type = filing.get("form_type", "UNKNOWN")
    
    print(f"[Analyzer] Analyzing {ticker} - {form_type}...")
    
    # Fetch filing text
    filing_text = fetch_filing_text(filing)
    
    if not filing_text:
        return {
            "warrants_found": False,
            "red_flags_found": set(),
            "underwriters_found": set(),
            "risk_score": 0,
            "has_red_flags": False,
            "analysis_error": "Could not fetch filing text",
            "short_seller_signals": {
                'offering_amount': None,
                'high_interest_debt': False,
                'high_interest_debt_snippet': None,
                'resignation_detected': False,
                'resignation_snippet': None,
                'warrant_coverage': None,
            },
        }
    
    # Store filing text for signal extractor
    filing['filing_text'] = filing_text
    
    # Extract short seller signals using SignalExtractor
    signal_extractor = SignalExtractor()
    short_seller_signals = signal_extractor.extract_all_signals(filing_text)
    
    # Search for red flag keywords
    found_keywords = search_for_keywords(filing_text, RED_FLAG_KEYWORDS)
    
    # Search for underwriters
    found_underwriters = search_for_underwriters(filing_text, UNDERWRITERS)
    
    # Calculate risk score (enhanced with short seller signals)
    base_risk_score = calculate_risk_score(found_keywords, found_underwriters)
    
    # Add risk points for short seller signals
    if short_seller_signals.get('high_interest_debt'):
        base_risk_score += 3  # Toxic debt is a major red flag
    if short_seller_signals.get('resignation_detected'):
        base_risk_score += 4  # Management turnover is very concerning
    if short_seller_signals.get('warrant_coverage'):
        # High warrant coverage increases risk
        try:
            coverage = float(short_seller_signals['warrant_coverage'].replace('%', ''))
            if coverage >= 100:
                base_risk_score += 2  # 100%+ warrant coverage is dilutive
        except ValueError:
            pass
    
    risk_score = base_risk_score
    
    # Check specifically for warrants
    warrants_found = "warrant" in found_keywords or any("warrant" in kw.lower() for kw in found_keywords)
    # Also check signal extractor's warrant coverage
    if short_seller_signals.get('warrant_coverage'):
        warrants_found = True
    
    # Determine if any red flags exist
    has_red_flags = (
        len(found_keywords) > 0 or 
        len(found_underwriters) > 0 or
        short_seller_signals.get('high_interest_debt') or
        short_seller_signals.get('resignation_detected')
    )
    
    result = {
        "warrants_found": warrants_found,
        "red_flags_found": found_keywords,
        "underwriters_found": found_underwriters,
        "risk_score": risk_score,
        "has_red_flags": has_red_flags,
        "short_seller_signals": short_seller_signals,
    }
    
    if has_red_flags:
        signal_summary = []
        if short_seller_signals.get('high_interest_debt'):
            signal_summary.append("Toxic Debt")
        if short_seller_signals.get('resignation_detected'):
            signal_summary.append("Management Turnover")
        if short_seller_signals.get('warrant_coverage'):
            signal_summary.append(f"Warrants: {short_seller_signals['warrant_coverage']}")
        
        signals_str = ", ".join(signal_summary) if signal_summary else ""
        print(f"[Analyzer] ⚠️  Red flags found for {ticker}: {len(found_keywords)} keywords, {len(found_underwriters)} underwriters, {signals_str} (Risk Score: {risk_score})")
    else:
        print(f"[Analyzer] ✓ No red flags found for {ticker}")
    
    return result


def analyze_filings(filings: List[Dict]) -> List[Dict]:
    """
    Analyzes multiple filings and returns enriched results.
    
    This function processes a batch of filings and adds analysis results
    to each filing dictionary.
    
    Args:
        filings: List of filing dictionaries to analyze
        
    Returns:
        List of filing dictionaries with analysis results added
    """
    analyzed_filings = []
    
    for i, filing in enumerate(filings, 1):
        print(f"\n[Analyzer] Processing filing {i}/{len(filings)}...")
        
        # Analyze the filing
        analysis = analyze_filing(filing)
        
        # Merge analysis results into filing dict
        filing_with_analysis = {**filing, **analysis}
        analyzed_filings.append(filing_with_analysis)
        
        # Add delay between filings to respect rate limits
        if i < len(filings):
            time.sleep(SEC_REQUEST_DELAY * 2)  # Longer delay for document fetches
    
    return analyzed_filings


if __name__ == "__main__":
    # Test the analyzer
    print("=" * 60)
    print("Analyzer - Test Run")
    print("=" * 60)
    
    # Create a sample filing for testing
    test_filing = {
        "ticker": "TEST",
        "form_type": "S-1",
        "cik": "0000320193",  # Apple (for URL construction testing)
        "link": "https://www.sec.gov/cgi-bin/viewer?action=view&cik=320193&accession_number=0000320193-21-000123&xbrl_type=S-1",
        "title": "Form S-1 - Test Company",
    }
    
    print("\n[Analyzer] Note: This test requires a valid SEC filing URL")
    print("[Analyzer] For real testing, use a filing from filing_scanner.py")
    
    # Uncomment to test with a real filing:
    # analysis = analyze_filing(test_filing)
    # print(f"\nAnalysis result: {analysis}")