"""
Filing Parser: Extracts structured data from SEC filings

This module parses the actual filing documents to extract important details
such as offering amount, share price, underwriters, use of proceeds, etc.
"""

import re
import time
import requests
from typing import Dict, Optional, List
from bs4 import BeautifulSoup

from config import SEC_HEADERS, SEC_BASE_URL, SEC_REQUEST_DELAY, MAX_RETRIES, RETRY_DELAY


def extract_text_from_html(html_content: str) -> str:
    """
    Extracts plain text from HTML content, preserving structure.
    
    Args:
        html_content: HTML content as string
        
    Returns:
        Plain text content
    """
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
        
        # Get text and clean up whitespace
        text = soup.get_text(separator='\n', strip=True)
        
        # Clean up excessive whitespace
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        text = '\n'.join(lines)
        
        return text
    except Exception as e:
        print(f"[Filing Parser] Error parsing HTML: {e}")
        # Fallback: return as-is if BeautifulSoup fails
        return html_content


def get_primary_document_url_from_index(index_url: str) -> Optional[str]:
    """
    Extracts the primary document URL from an SEC index.htm page.
    
    The index page lists all documents in the filing. We want the primary
    document (usually the .txt or .htm version of the main filing).
    
    Args:
        index_url: URL to the SEC index.htm page
        
    Returns:
        URL to the primary document, or None if not found
    """
    try:
        time.sleep(SEC_REQUEST_DELAY)
        response = requests.get(index_url, headers=SEC_HEADERS, timeout=30)
        
        if response.status_code == 200:
            # Parse HTML to find primary document
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Look for table rows with document links
            # Primary document is usually the first non-index document
            for row in soup.find_all('tr'):
                cells = row.find_all('td')
                if len(cells) >= 2:
                    link = cells[0].find('a')
                    if link and link.get('href'):
                        href = link.get('href')
                        doc_name = cells[0].get_text(strip=True).lower()
                        
                        # Skip index files
                        if 'index' in doc_name:
                            continue
                        
                        # Prefer .txt files, then .htm
                        if '.txt' in href.lower():
                            # Construct full URL
                            base_url = '/'.join(index_url.split('/')[:-1])
                            return f"{base_url}/{href}"
                        elif '.htm' in href.lower() and '.html' not in href.lower():
                            # Save .htm as fallback
                            base_url = '/'.join(index_url.split('/')[:-1])
                            return f"{base_url}/{href}"
            
            # Fallback: construct URL from index URL pattern
            # Format: .../data/CIK/ACCESSION/accession-index.htm
            # Primary: .../data/CIK/ACCESSION/accession.txt
            if '-index.htm' in index_url:
                primary_url = index_url.replace('-index.htm', '.txt')
                return primary_url
            
    except Exception as e:
        print(f"[Filing Parser] Error parsing index page: {e}")
    
    return None


def fetch_filing_document(filing: Dict) -> Optional[str]:
    """
    Fetches the actual filing document text.
    
    This function constructs the document URL and fetches the text content.
    It handles both direct document URLs and index.htm URLs.
    
    Args:
        filing: Filing dictionary with 'link' field
        
    Returns:
        Document text content, or None if fetch fails
    """
    filing_url = filing.get("link") or filing.get("url", "")
    
    if not filing_url:
        print(f"[Filing Parser] No filing URL provided")
        return None
    
    # Check if URL is an index page
    if '-index.htm' in filing_url or '/index.htm' in filing_url:
        # Extract primary document URL from index page
        doc_url = get_primary_document_url_from_index(filing_url)
        if not doc_url:
            # Fallback: try to construct from index URL
            doc_url = filing_url.replace('-index.htm', '.txt')
    else:
        # Assume it's already a document URL
        from analyzer import get_filing_document_url
        doc_url = get_filing_document_url(filing)
    
    if not doc_url:
        print(f"[Filing Parser] Could not construct document URL")
        return None
    
    print(f"[Filing Parser] Fetching filing document from: {doc_url[:80]}...")
    
    # Try both .txt and .htm extensions
    for extension in [".txt", ".htm", ".html"]:
        url_with_ext = doc_url if doc_url.endswith(extension) else doc_url.replace(".txt", extension)
        
        for attempt in range(MAX_RETRIES):
            try:
                time.sleep(SEC_REQUEST_DELAY)
                
                response = requests.get(
                    url_with_ext,
                    headers=SEC_HEADERS,
                    timeout=60
                )
                
                if response.status_code == 200:
                    content_type = response.headers.get("content-type", "").lower()
                    
                    if "html" in content_type:
                        # Extract text from HTML
                        text = extract_text_from_html(response.text)
                    else:
                        # Plain text
                        text = response.text
                    
                    print(f"[Filing Parser] Successfully fetched {len(text)} characters")
                    return text
                    
                elif response.status_code == 404:
                    # Try next extension
                    break
                    
                elif response.status_code == 429:
                    wait_time = RETRY_DELAY * (attempt + 1)
                    print(f"[Filing Parser] Rate limited. Waiting {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_DELAY * (attempt + 1))
                        
            except requests.RequestException as e:
                print(f"[Filing Parser] Request failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
    
    print(f"[Filing Parser] Failed to fetch filing document")
    return None


def extract_offering_amount(text: str) -> Optional[str]:
    """
    Extracts the offering amount from filing text.
    
    Looks for patterns like:
    - "$125,000,000"
    - "up to $125,000,000"
    - "125 million"
    - "Proposed maximum aggregate offering price: $125,000,000"
    
    Args:
        text: Filing text content
        
    Returns:
        Offering amount string, or None if not found
    """
    # Clean up text - remove HTML entities and extra whitespace
    text_clean = re.sub(r'&[#\w]+;', ' ', text)  # Remove HTML entities
    text_clean = re.sub(r'\s+', ' ', text_clean)  # Normalize whitespace
    
    # Priority 1: Look for amount near "preliminary prospectus" or in header (most reliable)
    header_pattern = r'(?:preliminary\s+prospectus|prospectus)[^$]*?\$([\d,]{7,}(?:,\d{3})*)'
    header_match = re.search(header_pattern, text_clean[:100000], re.IGNORECASE | re.DOTALL)
    if header_match:
        amount_str = header_match.group(1).replace(',', '')
        try:
            amount = int(amount_str)
            # Validate it's a reasonable offering amount
            if 10_000_000 <= amount <= 500_000_000:
                return f"${amount:,}"
        except ValueError:
            pass
    
    # Priority 2: Look for "$X,XXX,XXX" format (with commas, typical offering format)
    # Filter to reasonable offering amounts ($10M to $500M)
    exact_pattern = r'\$([\d,]{7,}(?:,\d{3})*)(?!\s*[mb]illion)'
    exact_matches = re.findall(exact_pattern, text_clean, re.IGNORECASE)
    
    if exact_matches:
        amounts = []
        for match in exact_matches:
            num_str = match.replace(',', '')
            try:
                amount = int(num_str)
                # Only include reasonable offering amounts
                if 10_000_000 <= amount <= 500_000_000:
                    amounts.append(amount)
            except ValueError:
                continue
        
        if amounts:
            # Return the smallest amount (usually the base offering, not including overallotment)
            amounts.sort()
            return f"${amounts[0]:,}"
    
    # Priority 3: 8-K specific patterns (announcement-style language)
    # 8-K filings often announce offerings with different wording
    eight_k_patterns = [
        # "sold X shares for gross proceeds of $Y" or "sold $Y of shares"
        r'(?:sold|purchased|issued).{0,200}?(?:gross\s+proceeds|proceeds|for|at|amount\s+of)[:\s]*\$([\d,]{7,}(?:,\d{3})*)',
        # "entered into purchase agreement for $Y" or "agreement to purchase up to $Y"
        r'(?:entered\s+into|executed|signed).{0,200}?(?:purchase\s+agreement|common\s+stock\s+purchase).{0,200}?(?:for|up\s+to|maximum)[:\s]*\$([\d,]{7,}(?:,\d{3})*)',
        # "total offering size of $Y" or "aggregate offering proceeds of $Y"
        r'(?:total\s+offering\s+size|aggregate\s+offering\s+proceeds|total\s+proceeds|offering\s+size)[:\s]*\$([\d,]{7,}(?:,\d{3})*)',
    ]
    
    for pattern in eight_k_patterns:
        matches = re.findall(pattern, text_clean, re.IGNORECASE | re.DOTALL)
        if matches:
            for match in matches:
                try:
                    amount_str = match.replace(',', '')
                    amount = int(amount_str)
                    if 10_000_000 <= amount <= 500_000_000:
                        return f"${amount:,}"
                except ValueError:
                    continue
    
    # Priority 4: Fallback patterns
    fallback_patterns = [
        r'\$[\d,]+(?:,\d{3})*(?:\s*(?:million|billion|M|B))?\b',
        r'(?:up to|maximum|aggregate|proposed)[:\s]*\$[\d,]+(?:,\d{3})*',
        r'offering[:\s]*\$[\d,]+(?:,\d{3})*',
    ]
    
    for pattern in fallback_patterns:
        matches = re.findall(pattern, text_clean, re.IGNORECASE)
        if matches:
            # Extract and filter amounts
            amounts = []
            for match in matches:
                match_clean = re.sub(r'\s+[bB]\s', '', match).strip()
                num_match = re.search(r'([\d,]+)', match_clean)
                if num_match:
                    num_str = num_match.group(1).replace(',', '')
                    try:
                        amount = int(num_str)
                        # Handle million/billion multipliers
                        if 'million' in match_clean.lower():
                            amount *= 1_000_000
                        elif 'billion' in match_clean.lower():
                            amount *= 1_000_000_000
                        # Filter to reasonable amounts
                        if 10_000_000 <= amount <= 500_000_000:
                            amounts.append(amount)
                    except ValueError:
                        continue
            
            if amounts:
                # Return smallest reasonable amount
                amounts.sort()
                return f"${amounts[0]:,}"
    
    return None


def extract_share_price(text: str) -> Optional[str]:
    """
    Extracts share price or price range from filing text.
    
    Looks for patterns like:
    - "$10.00 per share"
    - "between $10.00 and $12.00 per share"
    - "price range: $10.00 - $12.00"
    
    Args:
        text: Filing text content
        
    Returns:
        Share price string, or None if not found
    """
    # Patterns for share price
    patterns = [
        r'\$\d+\.\d{2}(?:\s*-\s*\$\d+\.\d{2})?\s*(?:per\s*)?share',
        r'price[:\s]*\$?\d+\.\d{2}(?:\s*-\s*\$?\d+\.\d{2})?',
        r'between\s+\$?\d+\.\d{2}\s+and\s+\$?\d+\.\d{2}\s+per\s*share',
        # 8-K patterns: "priced at $X per share" or "sold at $X per share"
        r'(?:priced|sold|purchased|issued)\s+at\s+\$?\d+\.\d{2}(?:\s*per\s*share)?',
        # "purchase price of $X per share"
        r'purchase\s+price[:\s]*\$?\d+\.\d{2}(?:\s*per\s*share)?',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return matches[0]
    
    return None


def extract_number_of_shares(text: str) -> Optional[str]:
    """
    Extracts number of shares from filing text.
    
    Looks for patterns like:
    - "12,500,000 Class A ordinary shares"
    - "10,000,000 shares"
    - "up to 10,000,000 shares"
    - "10 million shares"
    
    Args:
        text: Filing text content
        
    Returns:
        Number of shares string, or None if not found
    """
    # Clean up text
    text_clean = re.sub(r'&[#\w]+;', ' ', text)
    text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
    text_clean = re.sub(r'\s+', ' ', text_clean)
    
    # Patterns for number of shares - prioritize specific patterns
    patterns = [
        # "12,500,000 Class A ordinary shares" or "12,500,000 shares"
        r'[\d,]{7,}(?:,\d{3})*\s+(?:Class\s+[A-Z]\s+)?(?:ordinary\s+)?shares',
        # "10,000,000 shares"
        r'[\d,]+(?:,\d{3})*\s+shares',
        # "10 million shares"
        r'[\d,]+(?:\s*(?:million|billion|M|B))?\s+shares',
        # 8-K patterns: "sold X shares" or "issued X shares" or "purchased X shares"
        r'(?:sold|issued|purchased|to\s+purchase)[:\s]+[\d,]+(?:,\d{3})*\s+(?:shares?\s+of\s+common\s+stock|shares?)',
        # "up to X shares" (common in purchase agreements)
        r'up\s+to\s+[\d,]+(?:,\d{3})*\s+shares',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text_clean, re.IGNORECASE)
        if matches:
            # Return the first match (usually the main offering)
            match = matches[0]
            # Clean up - extract just the number and "shares"
            num_match = re.search(r'([\d,]+(?:,\d{3})*)', match)
            if num_match:
                num_str = num_match.group(1)
                # If "million" is mentioned, convert to number
                if 'million' in match.lower():
                    try:
                        num = int(num_str.replace(',', ''))
                        return f"{num * 1_000_000:,} shares"
                    except ValueError:
                        pass
                return f"{num_str} shares"
            return match.strip()
    
    return None


def extract_underwriters(text: str, known_underwriters: List[str]) -> List[str]:
    """
    Extracts underwriter names from filing text.
    
    Looks for underwriter mentions in the text, especially matching
    the known list of problematic underwriters.
    
    Args:
        text: Filing text content
        known_underwriters: List of known underwriter names to search for
        
    Returns:
        List of underwriter names found
    """
    found_underwriters = []
    text_lower = text.lower()
    
    for underwriter in known_underwriters:
        # Search for the underwriter name (case-insensitive)
        pattern = r'\b' + re.escape(underwriter.lower()) + r'\b'
        if re.search(pattern, text_lower, re.IGNORECASE):
            found_underwriters.append(underwriter)
    
    # Also look for common underwriter section patterns
    # "The underwriters are: Maxim Group LLC, Wainwright & Co."
    underwriter_section = re.search(
        r'(?:underwriters?|placement\s+agents?)[:\s]+(.*?)(?:\n\n|\.\s+(?:The|We|This)|$)', 
        text, 
        re.IGNORECASE | re.DOTALL
    )
    
    if underwriter_section:
        section_text = underwriter_section.group(1)
        # Extract company names (capitalized words)
        companies = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:LLC|Inc|Corp|Group|Partners|Capital|Securities|Co\.?)', section_text)
        found_underwriters.extend(companies)
    
    # Remove duplicates and return
    return list(set(found_underwriters))


def extract_use_of_proceeds(text: str) -> Optional[str]:
    """
    Extracts use of proceeds information from filing text.
    
    Looks for "use of proceeds" section which explains how the money will be used.
    
    Args:
        text: Filing text content
        
    Returns:
        Summary of use of proceeds, or None if not found
    """
    # Clean up text for better matching
    text_clean = re.sub(r'&[#\w]+;', ' ', text)  # Remove HTML entities
    text_clean = re.sub(r'<[^>]+>', ' ', text_clean)  # Remove HTML tags
    text_clean = re.sub(r'\s+', ' ', text_clean)  # Normalize whitespace
    
    # Find "use of proceeds" section
    use_section = re.search(
        r'use\s+of\s+proceeds[:\s]+(.*?)(?:\n\n|use\s+of\s+proceeds|risk\s+factors|table\s+of\s+contents|$)', 
        text_clean, 
        re.IGNORECASE | re.DOTALL
    )
    
    if use_section:
        section_text = use_section.group(1)
        # Extract first few sentences (clean up HTML artifacts)
        sentences = re.findall(r'[^.!?]+[.!?]', section_text)
        if sentences:
            # Take first 3 sentences and clean them up
            summary = ' '.join(sentences[:3])
            # Remove excessive whitespace and HTML remnants
            summary = re.sub(r'\s+', ' ', summary).strip()
            # Limit length to reasonable summary
            if len(summary) > 500:
                summary = summary[:500] + '...'
            return summary
    
    return None


def extract_overallotment_option(text: str) -> Optional[Dict]:
    """
    Extracts overallotment option (green shoe) information from filing text.
    
    Looks for patterns like:
    - "up to an additional 1,875,000 shares"
    - "$143,750,000 if the underwriters' overallotment option is exercised"
    - "45-day option to purchase up to X shares"
    
    Args:
        text: Filing text content
        
    Returns:
        Dictionary with overallotment info: {"shares": str, "amount": str, "option_days": str}, or None
    """
    text_clean = re.sub(r'&[#\w]+;', ' ', text)
    text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
    text_clean = re.sub(r'\s+', ' ', text_clean)
    
    # Look for overallotment option mentions with amounts
    # Pattern: "or $X if the underwriters' overallotment option" - the amount AFTER "or" is the total with overallotment
    # Also: "$X if...overallotment option exercised" where $X is AFTER "if"
    # This amount is the TOTAL (base + overallotment)
    overallotment_amount_patterns = [
        # Pattern: "$X, or $Y if overallotment option" - capture the Y amount
        r'\$[\d,]{7,}(?:,\d{3})*[,\s]+or\s+\$([\d,]{7,}(?:,\d{3})*)[^.]{0,200}?if[^.]{0,200}?over[\s-]*allotment',
        # Pattern: "if overallotment...$X" - amount that appears after "if overallotment"
        r'(?:if\s+(?:the\s+)?underwriters?[\'s]*\s+over[\s-]*allotment\s+option|over[\s-]*allotment\s+option[^.]{0,200}exercised)[^.]{0,300}?\$([\d,]{7,}(?:,\d{3})*)',
        # Pattern: "$X if overallotment" - but only if X is larger than typical base offering
        r'\$([\d,]{7,}(?:,\d{3})*)[^.]{0,100}?if[^.]{0,150}?over[\s-]*allotment\s+option[^.]{0,100}?exercised',
    ]
    
    overallotment_amount = None
    for pattern in overallotment_amount_patterns:
        amount_match = re.search(pattern, text_clean, re.IGNORECASE | re.DOTALL)
        if amount_match:
            # Get the capture group (amount)
            amt_str = None
            if amount_match.lastindex:
                # Get the first non-empty group
                for i in range(1, amount_match.lastindex + 1):
                    if amount_match.group(i):
                        amt_str = amount_match.group(i).replace(',', '')
                        break
            
            if amt_str:
                try:
                    amt = int(amt_str)
                    # Must be larger than typical base offering (overallotment total includes base + overallotment)
                    # Look for amounts in the range $140M-$200M (typical base + 15% overallotment)
                    if 140_000_000 <= amt <= 1_000_000_000:  # Reasonable range for total with overallotment
                        overallotment_amount = f"${amt:,}"
                        break
                except ValueError:
                    continue
    
    # Look for overallotment shares - "additional X shares" in context of option
    # Be specific: look for "up to an additional X shares" near "overallotment"
    overallotment_shares_patterns = [
        r'option[^.]{0,300}?up\s+to\s+an\s+additional\s+([\d,]{6,}(?:,\d{3})*)\s+shares?',
        r'option[^.]{0,300}?additional\s+([\d,]{6,}(?:,\d{3})*)\s+Class\s+[A-Z]\s+ordinary\s+shares?',
        r'up\s+to\s+an\s+additional\s+([\d,]{6,}(?:,\d{3})*)\s+shares?[^.]{0,100}?over[\s-]*allotment',
        r'over[\s-]*allotment[^.]{0,200}?([\d,]{6,}(?:,\d{3})*)\s+shares?',
    ]
    
    overallotment_shares = None
    for pattern in overallotment_shares_patterns:
        shares_match = re.search(pattern, text_clean, re.IGNORECASE | re.DOTALL)
        if shares_match:
            shares_str = shares_match.group(1).replace(',', '')
            try:
                shares_num = int(shares_str)
                # Overallotment shares should be reasonable (typically 10-30% of base offering, so 1M-5M range)
                if 500_000 <= shares_num <= 10_000_000:
                    overallotment_shares = shares_match.group(1)
                    break
            except ValueError:
                continue
    
    # If we found overallotment amount but not shares, try to calculate from amount
    if overallotment_amount and not overallotment_shares:
        # Try to extract share price and calculate shares
        price_match = re.search(r'(?:offering\s+price|per\s+share)[:\s]*\$?([\d\.]+)', text_clean, re.IGNORECASE)
        if price_match:
            try:
                price = float(price_match.group(1))
                # Extract amount value
                amt_str = overallotment_amount.replace('$', '').replace(',', '')
                amt = int(amt_str)
                # Calculate shares (overallotment amount typically includes base offering)
                # So subtract base offering to get overallotment-only amount
                # But safer: look for the pattern "$X if overallotment option exercised"
                # This total includes base + overallotment
            except ValueError:
                pass
    
    # Extract option period (days) - look for "X-day option"
    days_match = re.search(r'(\d+)[\s-]*day[\s-]*option[^.]{0,300}?(?:over[\s-]*allotment|additional)', text_clean, re.IGNORECASE)
    option_days = days_match.group(1) if days_match else None
    
    if overallotment_shares or overallotment_amount:
        return {
            "shares": overallotment_shares,
            "amount": overallotment_amount,
            "option_days": option_days,
        }
    
    return None


def extract_warrants_info(text: str) -> Dict:
    """
    Extracts warrant information from filing text.
    
    Looks for patterns like:
    - "warrants that would become exercisable"
    - "investors in this offering will not receive warrants"
    - "X warrants for each share"
    - "warrant coverage of X%"
    - Warrant coverage percentages (aligned with SignalExtractor patterns)
    
    Args:
        text: Filing text content
        
    Returns:
        Dictionary with warrant info: {"has_warrants": bool, "warrants_per_share": str, "notes": str}
    """
    text_clean = re.sub(r'&[#\w]+;', ' ', text)
    text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
    text_clean = re.sub(r'\s+', ' ', text_clean)
    
    # Check if offering includes warrants
    no_warrants_patterns = [
        r'will\s+not\s+receive\s+warrants',
        r'no\s+warrants',
        r'unlike.*?warrants',
    ]
    
    # Enhanced patterns aligned with SignalExtractor's warrant_coverage patterns
    has_warrants_patterns = [
        # Pattern: "warrants that would become exercisable"
        r'warrants?\s+(?:that\s+)?(?:would\s+)?(?:become\s+)?exercisable',
        # Pattern: "X warrants for each share" or "X warrants per share"
        r'X\s+warrants?\s+(?:for|per)\s+each\s+share',
        r'[\d\.]+\s+warrants?\s+(?:for|per)\s+(?:each\s+)?(?:share|unit)',
        # Pattern: "warrant coverage of 100%" or "100% warrant coverage" (from SignalExtractor)
        r'warrant\s+coverage[^.]{0,100}?([\d]+(?:\.[\d]+)?)%',
        r'([\d]+(?:\.[\d]+)?)%[^.]{0,50}?warrant\s+coverage',
        # Pattern: "warrants to purchase X% of shares"
        r'warrants?\s+to\s+purchase[^.]{0,100}?([\d]+(?:\.[\d]+)?)%',
        # Pattern: "X warrants for each share" (numeric)
        r'([\d]+(?:\.[\d]+)?)\s+warrants?\s+(?:for|per)\s+each\s+share',
    ]
    
    # Check for "no warrants" first
    has_warrants = False
    notes = None
    warrants_per_share = None
    
    for pattern in no_warrants_patterns:
        if re.search(pattern, text_clean, re.IGNORECASE):
            # Only mark as "no warrants" if we don't find positive evidence elsewhere
            # (Some filings might say "no warrants in this offering" but still mention them)
            pass  # Don't break here - continue checking for positive patterns
    
    # Check for "has warrants" patterns (including warrant coverage)
    for pattern in has_warrants_patterns:
        matches = list(re.finditer(pattern, text_clean, re.IGNORECASE))
        if matches:
            has_warrants = True
            # Extract warrant ratio or coverage percentage
            match = matches[0]  # Use first match
            # Try to extract numeric value from match groups
            for i in range(1, match.lastindex + 1 if match.lastindex else 0):
                try:
                    value = match.group(i)
                    # If it's a percentage from warrant coverage, store as warrants_per_share
                    if '%' not in pattern and value:
                        warrants_per_share = value
                    break
                except IndexError:
                    continue
            
            # Also try to extract ratio separately
            if not warrants_per_share:
                ratio_match = re.search(r'([\d\.]+)\s+warrants?\s+(?:for|per)', text_clean, re.IGNORECASE)
                if ratio_match:
                    warrants_per_share = ratio_match.group(1)
            
            # Extract context snippet
            start = max(0, match.start() - 100)
            end = min(len(text_clean), match.end() + 100)
            notes = text_clean[start:end].strip()[:200]
            
            return {
                "has_warrants": True,
                "warrants_per_share": warrants_per_share,
                "notes": notes,
            }
    
    return {
        "has_warrants": has_warrants,
        "warrants_per_share": None,
        "notes": notes,
    }


def extract_private_placement_info(text: str) -> Optional[Dict]:
    """
    Extracts private placement information from filing text.
    
    Looks for patterns like:
    - "private placement shares"
    - "private placement for an aggregate purchase price of $X"
    - "founder shares" or "sponsor shares"
    
    Args:
        text: Filing text content
        
    Returns:
        Dictionary with private placement info: {"amount": str, "shares": str, "notes": str}, or None
    """
    text_clean = re.sub(r'&[#\w]+;', ' ', text)
    text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
    text_clean = re.sub(r'\s+', ' ', text_clean)
    
    # Look for private placement mentions
    private_patterns = [
        r'private\s+placement[^.]{0,500}?\$[\d,]+(?:,\d{3})*',
        r'private\s+placement[^.]{0,500}?[\d,]+(?:,\d{3})*\s+shares?',
        r'(?:founder|sponsor)\s+shares?[^.]{0,300}?[\d,]+(?:,\d{3})*',
    ]
    
    for pattern in private_patterns:
        matches = re.findall(pattern, text_clean, re.IGNORECASE | re.DOTALL)
        if matches:
            match = matches[0]
            
            # Extract amount
            amount_match = re.search(r'\$([\d,]+(?:,\d{3})*)', match)
            amount = f"${amount_match.group(1)}" if amount_match else None
            
            # Extract shares
            shares_match = re.search(r'([\d,]+(?:,\d{3})*)\s+shares?', match, re.IGNORECASE)
            shares = shares_match.group(1) if shares_match else None
            
            # Check if this is a significant private placement (not just mentioning price)
            # Filter out amounts that are just share prices (typically $10 or less for SPACs)
            if amount:
                # Check if amount is reasonable for private placement (not just share price)
                amt_str = amount.replace('$', '').replace(',', '')
                try:
                    amt_val = int(amt_str)
                    # Private placement should be significant (at least $1M)
                    if amt_val < 1_000_000:
                        amount = None  # Likely a share price, not placement amount
                except ValueError:
                    pass
            
            # Check if this is a significant private placement
            if amount or shares:
                # Extract brief context
                context_start = max(0, text_clean.find(match) - 50)
                context_end = min(len(text_clean), text_clean.find(match) + len(match) + 100)
                notes = text_clean[context_start:context_end].strip()[:300]
                
                return {
                    "amount": amount,
                    "shares": shares,
                    "notes": notes,
                }
    
    return None


def extract_dilution_info(text: str) -> Optional[str]:
    """
    Extracts dilution-related information from filing text.
    
    Looks for dilution discussions, outstanding shares, etc.
    
    Args:
        text: Filing text content
        
    Returns:
        Dilution information summary, or None if not found
    """
    # Find dilution section
    dilution_section = re.search(
        r'(?:dilution|outstanding\s+shares)[:\s]+(.*?)(?:\n\n\w+\s+\d+|risk\s+factors|use\s+of\s+proceeds|$)', 
        text, 
        re.IGNORECASE | re.DOTALL
    )
    
    if dilution_section:
        section_text = dilution_section.group(1)
        # Extract first few sentences
        sentences = re.findall(r'[^.!?]+[.!?]', section_text)
        if sentences:
            summary = ' '.join(sentences[:3])
            return summary.strip()
    
    return None


def find_original_s1_filing(cik: str, registration_number: str) -> Optional[Dict]:
    """
    Finds the original S-1 filing for a given registration number.
    
    When we encounter an S-1/A amendment without full offering details,
    we can look up the original S-1 filing to get complete information.
    
    Args:
        cik: Company CIK (10-digit string)
        registration_number: SEC registration number (e.g., "333-292682")
        
    Returns:
        Filing dictionary with link to original S-1, or None if not found
    """
    import requests
    from config import SEC_HEADERS, SEC_REQUEST_DELAY, SEC_BASE_URL
    import time
    
    # Normalize CIK
    cik_numeric = str(cik).lstrip("0")
    if not cik_numeric:
        return None
    
    print(f"[Filing Parser] Searching for original S-1 filing: Registration {registration_number}, CIK {cik_numeric}")
    
    # SEC EDGAR search URL: Search by CIK and form type
    # We'll search for S-1 forms (not S-1/A) for this CIK
    search_url = f"{SEC_BASE_URL}/cgi-bin/browse-edgar"
    
    params = {
        "action": "getcompany",
        "CIK": cik_numeric,
        "type": "S-1",
        "dateb": "",
        "owner": "exclude",
        "count": "100",
        "output": "atom"
    }
    
    try:
        time.sleep(SEC_REQUEST_DELAY)
        response = requests.get(search_url, params=params, headers=SEC_HEADERS, timeout=30)
        
        if response.status_code != 200:
            return None
        
        # Parse ATOM feed to find S-1 with matching registration number
        import xml.etree.ElementTree as ET
        root = ET.fromstring(response.content)
        atom_ns = "{http://www.w3.org/2005/Atom}"
        
        entries = root.findall(f".//{atom_ns}entry")
        for entry in entries:
            # Get filing link
            link_elem = entry.find(f"./{atom_ns}link")
            if link_elem is None:
                continue
            
            link = link_elem.get("href", "")
            
            # Check if this is an S-1 (not S-1/A) and check registration number in link or title
            title_elem = entry.find(f"./{atom_ns}title")
            title = title_elem.text if title_elem is not None else ""
            
            # Look for S-1 (not S-1/A) and check if registration number appears in link/title
            if "S-1/A" not in title.upper() and "S-1" in title.upper():
                # Registration numbers often appear in URLs or titles
                if registration_number in link or registration_number in title:
                    print(f"[Filing Parser] Found original S-1: {link}")
                    return {
                        "link": link,
                        "title": title,
                        "form_type": "S-1",
                    }
        
        # If not found by registration number, try to get the most recent S-1
        if entries:
            for entry in entries:
                link_elem = entry.find(f"./{atom_ns}link")
                title_elem = entry.find(f"./{atom_ns}title")
                if link_elem is not None and title_elem is not None:
                    title = title_elem.text if title_elem.text else ""
                    link = link_elem.get("href", "")
                    if "S-1/A" not in title.upper() and "S-1" in title.upper():
                        print(f"[Filing Parser] Found most recent S-1: {link}")
                        return {
                            "link": link,
                            "title": title,
                            "form_type": "S-1",
                        }
        
    except Exception as e:
        print(f"[Filing Parser] Error searching for original S-1: {e}")
    
    return None


def extract_registration_number(text: str) -> Optional[str]:
    """
    Extracts SEC registration number from filing text.
    
    Registration numbers typically appear as: "333-292682" or "Registration No. 333-292682"
    
    Args:
        text: Filing text content
        
    Returns:
        Registration number string (e.g., "333-292682"), or None if not found
    """
    import re
    
    text_clean = re.sub(r'&[#\w]+;', ' ', text)
    text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
    text_clean = re.sub(r'\s+', ' ', text_clean)
    
    # Patterns for registration numbers
    patterns = [
        r'registration\s+(?:no\.?|number|#)[:\s]*([\d]{3}[\s-]?[\d]{6,7})',
        r'registration\s+statement\s+number[:\s]*([\d]{3}[\s-]?[\d]{6,7})',
        r'(?:registration|file)\s+no\.?[:\s]*([\d]{3}[\s-]?[\d]{6,7})',
        r'333[- ]?[\d]{6,7}',  # Direct pattern for 333-XXXXXX
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text_clean[:50000], re.IGNORECASE)
        if matches:
            reg_num = matches[0].replace(' ', '-')
            # Normalize format (333-292682)
            if '-' not in reg_num and len(reg_num) >= 9:
                reg_num = reg_num[:3] + '-' + reg_num[3:]
            return reg_num
    
    return None


def parse_filing_details(filing: Dict, known_underwriters: List[str] = None, max_price: Optional[float] = None) -> Dict:
    """
    Main function: Parses a filing document and extracts structured details.
    
    This function:
    1. Fetches the filing document text
    2. Extracts offering amount, share price, number of shares
    3. Extracts underwriter information
    4. Extracts use of proceeds
    5. Extracts dilution information
    
    Args:
        filing: Filing dictionary with 'link' field
        known_underwriters: List of known underwriter names (optional)
        
    Returns:
        Dictionary with extracted filing details:
        {
            "offering_amount": str,
            "share_price": str,
            "number_of_shares": str,
            "underwriters": List[str],
            "use_of_proceeds": str,
            "dilution_info": str,
            "filing_text_length": int,
        }
    """
    ticker = filing.get("ticker", "UNKNOWN")
    form_type = filing.get("form_type", "UNKNOWN")
    
    # Skip S-1 lookup if we're already parsing an original S-1 that was looked up
    is_original_lookup = filing.get("_is_original_lookup", False)
    
    print(f"[Filing Parser] Parsing {ticker} - {form_type}...")
    
    # Fetch filing text
    filing_text = fetch_filing_document(filing)
    
    if not filing_text:
        return {
            "offering_amount": None,
            "share_price": None,
            "number_of_shares": None,
            "underwriters": [],
            "use_of_proceeds": None,
            "dilution_info": None,
            "filing_text_length": 0,
        }
    
    # Extract share price first (for price filtering)
    share_price = extract_share_price(filing_text)
    
    # Apply price filter if specified
    if max_price is not None:
        # Extract numeric price for comparison
        price_match = re.search(r'([\d\.]+)', share_price) if share_price else None
        if price_match:
            try:
                price = float(price_match.group(1))
                if price >= max_price:
                    print(f"[Filing Parser] {ticker} price ${price:.2f} >= ${max_price:.2f}, skipping full parsing")
                    return {
                        "base_offering_amount": None,
                        "share_price": share_price,
                        "number_of_shares": None,
                        "underwriters": [],
                        "use_of_proceeds": None,
                        "dilution_info": None,
                        "filing_text_length": len(filing_text),
                        "filtered_by_price": True,
                        "overallotment_shares": None,
                        "overallotment_amount": None,
                        "has_warrants": None,
                        "warrants_per_share": None,
                        "private_placement_shares": None,
                        "private_placement_amount": None,
                        "additional_dilutions": None,
                    }
            except ValueError:
                pass  # Continue with parsing if price extraction failed
    
    # Extract base offering details from the current filing
    offering_amount = extract_offering_amount(filing_text)
    number_of_shares = extract_number_of_shares(filing_text)
    use_of_proceeds = extract_use_of_proceeds(filing_text)
    dilution_info = extract_dilution_info(filing_text)
    
    # Extract additional dilutions
    overallotment = extract_overallotment_option(filing_text)
    warrants_info = extract_warrants_info(filing_text)
    private_placement = extract_private_placement_info(filing_text)
    
    # Extract underwriters (use config if not provided) - Do this before S-1 lookup
    if known_underwriters is None:
        from config import UNDERWRITERS
        known_underwriters = UNDERWRITERS
    
    underwriters = extract_underwriters(filing_text, known_underwriters)
    
    # If this is an S-1/A amendment and we're missing key offering details,
    # try to find and parse the original S-1 filing
    if form_type.upper() == "S-1/A" and not is_original_lookup:
        # Check if key details are missing
        missing_key_details = (
            not offering_amount or
            not share_price or
            not number_of_shares
        )
        
        if missing_key_details:
            # Extract registration number from the amendment
            registration_number = extract_registration_number(filing_text)
            cik = filing.get("cik", "")
            
            if registration_number and cik:
                print(f"[Filing Parser] S-1/A amendment missing details, searching for original S-1...")
                # Find original S-1 filing
                original_s1_filing = find_original_s1_filing(cik, registration_number)
                
                if original_s1_filing:
                    # Parse the original S-1 to get full offering details
                    # Mark it so we don't recursively look up S-1 for S-1 filings
                    original_s1_filing["_is_original_lookup"] = True
                    original_s1_filing["ticker"] = ticker  # Preserve ticker
                    original_s1_filing["cik"] = cik  # Preserve CIK
                    
                    print(f"[Filing Parser] Parsing original S-1 for complete offering details...")
                    original_s1_data = parse_filing_details(original_s1_filing, known_underwriters, max_price)
                    
                    # Merge original S-1 data with amendment data, preferring original S-1 when amendment is missing
                    if original_s1_data:
                        if not offering_amount and original_s1_data.get("base_offering_amount"):
                            offering_amount = original_s1_data.get("base_offering_amount")
                        if not share_price and original_s1_data.get("share_price"):
                            share_price = original_s1_data.get("share_price")
                        if not number_of_shares and original_s1_data.get("number_of_shares"):
                            number_of_shares = original_s1_data.get("number_of_shares")
                        if not use_of_proceeds and original_s1_data.get("use_of_proceeds"):
                            use_of_proceeds = original_s1_data.get("use_of_proceeds")
                        if not dilution_info and original_s1_data.get("dilution_info"):
                            dilution_info = original_s1_data.get("dilution_info")
                        # Merge additional dilutions
                        if not overallotment and original_s1_data.get("overallotment_shares"):
                            overallotment = {
                                "shares": original_s1_data.get("overallotment_shares"),
                                "amount": original_s1_data.get("overallotment_amount"),
                            }
                        if not warrants_info.get("has_warrants") and original_s1_data.get("has_warrants") is not None:
                            warrants_info["has_warrants"] = original_s1_data.get("has_warrants")
                            if original_s1_data.get("warrants_per_share"):
                                warrants_info["warrants_per_share"] = original_s1_data.get("warrants_per_share")
                        if not private_placement and original_s1_data.get("private_placement_shares"):
                            private_placement = {
                                "shares": original_s1_data.get("private_placement_shares"),
                                "amount": original_s1_data.get("private_placement_amount"),
                            }
                        # Merge underwriters
                        if not underwriters and original_s1_data.get("underwriters"):
                            underwriters = original_s1_data.get("underwriters")
                        
                        print(f"[Filing Parser] Merged offering details from original S-1")
                else:
                    print(f"[Filing Parser] Could not find original S-1 filing")
            else:
                print(f"[Filing Parser] Could not extract registration number or CIK for S-1 lookup")
    
    # Build dilution summary
    dilution_summary_parts = []
    if overallotment:
        overallotment_parts = []
        if overallotment.get("shares"):
            overallotment_parts.append(f"{overallotment['shares']} shares")
        if overallotment.get("amount"):
            overallotment_parts.append(overallotment['amount'])
        if overallotment_parts:
            dilution_summary_parts.append(f"Overallotment: {', '.join(overallotment_parts)}")
    
    if warrants_info.get("has_warrants"):
        if warrants_info.get("warrants_per_share"):
            dilution_summary_parts.append(f"Warrants: {warrants_info['warrants_per_share']} per share")
        else:
            dilution_summary_parts.append("Warrants: Yes")
    elif warrants_info.get("notes") and "not" in warrants_info.get("notes", "").lower():
        dilution_summary_parts.append("Warrants: No")
    
    if private_placement:
        private_parts = []
        if private_placement.get("shares"):
            private_parts.append(f"{private_placement['shares']} shares")
        if private_placement.get("amount"):
            private_parts.append(private_placement['amount'])
        # Only add if we have at least one meaningful value
        if private_parts:
            dilution_summary_parts.append(f"Private Placement: {', '.join(private_parts)}")
    
    dilution_summary = "; ".join(dilution_summary_parts) if dilution_summary_parts else None
    
    result = {
        "base_offering_amount": offering_amount,  # Renamed from offering_amount
        "share_price": share_price,
        "number_of_shares": number_of_shares,
        "underwriters": underwriters,
        "use_of_proceeds": use_of_proceeds,
        "dilution_info": dilution_info,
        "filing_text_length": len(filing_text),
        # Additional dilution fields
        "overallotment_shares": overallotment.get("shares") if overallotment else None,
        "overallotment_amount": overallotment.get("amount") if overallotment else None,
        "has_warrants": warrants_info.get("has_warrants"),
        "warrants_per_share": warrants_info.get("warrants_per_share"),
        "private_placement_shares": private_placement.get("shares") if private_placement else None,
        "private_placement_amount": private_placement.get("amount") if private_placement else None,
        "additional_dilutions": dilution_summary,  # Summary of all additional dilutions
    }
    
    print(f"[Filing Parser] ✓ Extracted details for {ticker}")
    if offering_amount:
        print(f"  Base offering amount: {offering_amount}")
    if share_price:
        print(f"  Share price: {share_price}")
    if overallotment:
        print(f"  Overallotment: {overallotment.get('shares', 'N/A')} shares, {overallotment.get('amount', 'N/A')}")
    if warrants_info.get("has_warrants") is not None:
        warrants_status = "Yes" if warrants_info["has_warrants"] else "No"
        if warrants_info.get("warrants_per_share"):
            warrants_status += f" ({warrants_info['warrants_per_share']} per share)"
        print(f"  Warrants: {warrants_status}")
    if underwriters:
        print(f"  Underwriters: {', '.join(underwriters)}")
    
    return result


if __name__ == "__main__":
    # Test the filing parser
    test_filing = {
        "ticker": "HLXC",
        "form_type": "S-1/A",
        "link": "https://www.sec.gov/Archives/edgar/data/2099656/000121390026005263/0001213900-26-005263-index.htm",
        "cik": "0002099656",
    }
    
    print("=" * 60)
    print("Filing Parser - Test Run")
    print("=" * 60)
    
    details = parse_filing_details(test_filing)
    
    print("\nExtracted details:")
    for key, value in details.items():
        if value:
            print(f"  {key}: {value}")
