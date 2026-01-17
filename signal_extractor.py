"""
Signal Extractor: Advanced Short Seller Signal Detection

This module extracts specific "Short Seller Signals" and financial data from
raw SEC filing text. It identifies dilution events, toxic debt, management
turnover, and warrant coverage - all critical red flags for short sellers.
"""

import re
from typing import Dict, Optional, Tuple
from datetime import datetime


class SignalExtractor:
    """
    Extracts short seller signals from SEC filing text.
    
    This class parses raw filing text to identify:
    - Offering amounts (cap raises)
    - Toxic debt (high interest rates)
    - Management turnover (executive resignations)
    - Warrant coverage (dilution kickers)
    """
    
    def __init__(self):
        """Initialize the SignalExtractor with compiled regex patterns."""
        # Compile regex patterns for better performance
        self._compile_patterns()
    
    def _compile_patterns(self):
        """Compile all regex patterns for efficient matching."""
        # Offering amount patterns
        self.offering_patterns = [
            # "Proposed Maximum Aggregate Offering Price: $15,000,000"
            re.compile(
                r'(?:proposed\s+maximum\s+aggregate\s+offering\s+price|maximum\s+aggregate\s+offering\s+price|aggregate\s+offering\s+price)[:\s]*\$?([\d,]+(?:\.[\d]{2})?)',
                re.IGNORECASE
            ),
            # "Gross Proceeds: $15,000,000"
            re.compile(
                r'gross\s+proceeds[:\s]*\$?([\d,]+(?:\.[\d]{2})?)',
                re.IGNORECASE
            ),
            # "$15,000,000 offering" or "offering of $15,000,000"
            re.compile(
                r'\$([\d,]+(?:\.[\d]{2})?)[^.]{0,200}?(?:offering|proceeds)',
                re.IGNORECASE
            ),
            re.compile(
                r'(?:offering|proceeds)[^.]{0,200}?\$([\d,]+(?:\.[\d]{2})?)',
                re.IGNORECASE
            ),
        ]
        
        # Toxic debt patterns - interest rates above 12%
        # Look for patterns like "20% Notes", "18% Senior Secured", "15% Convertible"
        self.toxic_debt_patterns = [
            # Pattern: "XX% Note" or "XX% Debenture" or "XX% Promissory"
            re.compile(
                r'([1-9][0-9]|1[0-9]{2})%[^.]{0,100}?(?:note|debenture|promissory|convertible|senior\s+secured|subordinated)',
                re.IGNORECASE
            ),
            # Pattern: "Note" or "Debenture" followed by "XX%" within context
            re.compile(
                r'(?:note|debenture|promissory|convertible)[^.]{0,100}?([1-9][0-9]|1[0-9]{2})%',
                re.IGNORECASE
            ),
            # Pattern: "interest rate of XX%" where XX >= 12
            re.compile(
                r'interest\s+rate[^.]{0,50}?([1-9][0-9]|1[0-9]{2})%',
                re.IGNORECASE
            ),
        ]
        
        # Management turnover patterns
        # Look for "Resigned" or "Resignation" near executive titles
        self.resignation_patterns = [
            # Pattern: "CFO resigned" or "Chief Financial Officer resigned"
            re.compile(
                r'(?:CFO|CEO|CTO|COO|Chief\s+Financial\s+Officer|Chief\s+Executive\s+Officer|Chief\s+Technology\s+Officer|Chief\s+Operating\s+Officer|President|Treasurer|Controller|Auditor|Independent\s+Auditor)[^.]{0,100}?(?:resigned|resignation)',
                re.IGNORECASE
            ),
            # Pattern: "resigned" followed by executive title
            re.compile(
                r'(?:resigned|resignation)[^.]{0,100}?(?:CFO|CEO|CTO|COO|Chief\s+Financial\s+Officer|Chief\s+Executive\s+Officer|Chief\s+Technology\s+Officer|Chief\s+Operating\s+Officer|President|Treasurer|Controller|Auditor|Independent\s+Auditor)',
                re.IGNORECASE
            ),
        ]
        
        # Warrant coverage patterns
        # Look for "warrant coverage" or "warrants to purchase" with percentages
        self.warrant_coverage_patterns = [
            # Pattern: "warrant coverage of 100%" or "100% warrant coverage"
            re.compile(
                r'warrant\s+coverage[^.]{0,100}?([\d]+(?:\.[\d]+)?)%',
                re.IGNORECASE
            ),
            re.compile(
                r'([\d]+(?:\.[\d]+)?)%[^.]{0,50}?warrant\s+coverage',
                re.IGNORECASE
            ),
            # Pattern: "warrants to purchase X% of shares" or "X warrants for each share"
            re.compile(
                r'warrants?\s+to\s+purchase[^.]{0,100}?([\d]+(?:\.[\d]+)?)%',
                re.IGNORECASE
            ),
            re.compile(
                r'([\d]+(?:\.[\d]+)?)\s+warrants?\s+(?:for|per)\s+each\s+share',
                re.IGNORECASE
            ),
        ]
    
    def extract_offering_amount(self, text: str) -> Optional[float]:
        """
        Extract the offering amount (cap raise) from filing text.
        
        Looks for "Proposed Maximum Aggregate Offering Price" or "Gross Proceeds"
        patterns and extracts the dollar amount.
        
        Uses stricter validation (aligned with filing_parser) to avoid capturing
        large registration amounts, total assets, or other non-offering amounts.
        
        Args:
            text: Raw filing text content
            
        Returns:
            Offering amount as float (e.g., 15000000.00), or None if not found
        """
        # Clean text for better matching
        text_clean = re.sub(r'&[#\w]+;', ' ', text)  # Remove HTML entities
        text_clean = re.sub(r'<[^>]+>', ' ', text_clean)  # Remove HTML tags
        text_clean = re.sub(r'\s+', ' ', text_clean)  # Normalize whitespace
        
        # Try each pattern
        amounts_found = []
        for pattern in self.offering_patterns:
            matches = pattern.findall(text_clean)
            if matches:
                # Extract all matches and validate each
                for amount_str in matches:
                    try:
                        amount = float(amount_str.replace(',', ''))
                        # Stricter validation: $10M to $500M (aligned with filing_parser)
                        # This avoids capturing large registration amounts, total assets, etc.
                        if 10_000_000 <= amount <= 500_000_000:
                            amounts_found.append(amount)
                    except ValueError:
                        continue
        
        # Return the smallest amount found (usually the base offering, not including overallotment)
        if amounts_found:
            amounts_found.sort()
            return amounts_found[0]
        
        return None
    
    def extract_toxic_debt(self, text: str) -> Tuple[bool, Optional[str]]:
        """
        Detect toxic debt (high interest rates above 12%).
        
        Looks for interest rates >= 12% associated with Notes, Debentures,
        or Promissory Notes - signs of distress financing.
        
        Args:
            text: Raw filing text content
            
        Returns:
            Tuple of (has_toxic_debt: bool, snippet: str or None)
            Example: (True, "20% Notes with a face amount of $250,000")
        """
        # Clean text
        text_clean = re.sub(r'&[#\w]+;', ' ', text)
        text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
        text_clean = re.sub(r'\s+', ' ', text_clean)
        
        # Try each pattern
        for pattern in self.toxic_debt_patterns:
            matches = list(pattern.finditer(text_clean))
            for match in matches:
                # Extract the interest rate
                rate_str = match.group(1)
                try:
                    rate = int(rate_str)
                    # Check if rate is >= 12% (toxic debt threshold)
                    if rate >= 12:
                        # Extract context snippet (200 chars around match)
                        start = max(0, match.start() - 100)
                        end = min(len(text_clean), match.end() + 100)
                        snippet = text_clean[start:end].strip()
                        # Clean up snippet
                        snippet = re.sub(r'\s+', ' ', snippet)
                        if len(snippet) > 300:
                            snippet = snippet[:300] + '...'
                        return (True, snippet)
                except ValueError:
                    continue
        
        return (False, None)
    
    def extract_management_turnover(self, text: str) -> Tuple[bool, Optional[str]]:
        """
        Detect management turnover (executive resignations).
        
        Looks for "Resigned" or "Resignation" within context of executive titles
        (CFO, CEO, Chief Financial Officer, Auditor, etc.).
        
        Args:
            text: Raw filing text content
            
        Returns:
            Tuple of (has_resignation: bool, snippet: str or None)
            Example: (True, "Ernest Scheidemann, CFO, resigned on Feb 25")
        """
        # Clean text
        text_clean = re.sub(r'&[#\w]+;', ' ', text)
        text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
        text_clean = re.sub(r'\s+', ' ', text_clean)
        
        # Try each pattern
        for pattern in self.resignation_patterns:
            matches = list(pattern.finditer(text_clean))
            for match in matches:
                # Extract context snippet (200 chars around match)
                start = max(0, match.start() - 100)
                end = min(len(text_clean), match.end() + 100)
                snippet = text_clean[start:end].strip()
                
                # Clean up snippet
                snippet = re.sub(r'\s+', ' ', snippet)
                if len(snippet) > 300:
                    snippet = snippet[:300] + '...'
                
                return (True, snippet)
        
        return (False, None)
    
    def extract_warrant_coverage(self, text: str) -> Optional[str]:
        """
        Extract warrant coverage percentage or ratio.
        
        Looks for "warrant coverage" or "warrants to purchase" patterns
        and extracts the percentage or ratio.
        
        Args:
            text: Raw filing text content
            
        Returns:
            Warrant coverage as string (e.g., "100%", "200%", "1.5"), or None
        """
        # Clean text
        text_clean = re.sub(r'&[#\w]+;', ' ', text)
        text_clean = re.sub(r'<[^>]+>', ' ', text_clean)
        text_clean = re.sub(r'\s+', ' ', text_clean)
        
        # Try each pattern
        for pattern in self.warrant_coverage_patterns:
            matches = pattern.findall(text_clean)
            if matches:
                # Return the first match
                coverage = matches[0]
                # Format as percentage if not already
                if '%' not in coverage:
                    coverage = f"{coverage}%"
                return coverage
        
        return None
    
    def extract_all_signals(self, text: str) -> Dict:
        """
        Extract all short seller signals from filing text.
        
        This is the main entry point that extracts all signals in one pass.
        
        Args:
            text: Raw filing text content
            
        Returns:
            Dictionary with all extracted signals:
            {
                'offering_amount': float or None,
                'high_interest_debt': bool,
                'high_interest_debt_snippet': str or None,
                'resignation_detected': bool,
                'resignation_snippet': str or None,
                'warrant_coverage': str or None,
            }
        """
        # Extract all signals
        offering_amount = self.extract_offering_amount(text)
        has_toxic_debt, toxic_debt_snippet = self.extract_toxic_debt(text)
        has_resignation, resignation_snippet = self.extract_management_turnover(text)
        warrant_coverage = self.extract_warrant_coverage(text)
        
        return {
            'offering_amount': offering_amount,
            'high_interest_debt': has_toxic_debt,
            'high_interest_debt_snippet': toxic_debt_snippet,
            'resignation_detected': has_resignation,
            'resignation_snippet': resignation_snippet,
            'warrant_coverage': warrant_coverage,
        }
    
    def extract_from_filing(self, filing: Dict) -> Dict:
        """
        Extract signals from a filing dictionary.
        
        This method fetches the filing text if not already present,
        then extracts all signals.
        
        Args:
            filing: Filing dictionary with 'link' field (and optionally 'filing_text')
            
        Returns:
            Dictionary with extracted signals (same format as extract_all_signals)
        """
        # Get filing text
        filing_text = filing.get('filing_text')
        
        if not filing_text:
            # Fetch filing text if not provided
            from filing_parser import fetch_filing_document
            filing_text = fetch_filing_document(filing)
        
        if not filing_text:
            # Return empty signals if we can't get text
            return {
                'offering_amount': None,
                'high_interest_debt': False,
                'high_interest_debt_snippet': None,
                'resignation_detected': False,
                'resignation_snippet': None,
                'warrant_coverage': None,
            }
        
        # Extract all signals
        return self.extract_all_signals(filing_text)


# Convenience function for backward compatibility
def extract_short_seller_signals(filing: Dict) -> Dict:
    """
    Convenience function to extract short seller signals from a filing.
    
    Args:
        filing: Filing dictionary with 'link' field
        
    Returns:
        Dictionary with extracted signals
    """
    extractor = SignalExtractor()
    return extractor.extract_from_filing(filing)


if __name__ == "__main__":
    # Test the SignalExtractor with provided test cases
    print("=" * 60)
    print("Signal Extractor - Test Cases")
    print("=" * 60)
    
    extractor = SignalExtractor()
    
    # Test Case 1: Toxic Debt
    test_text_1 = "The Company issued 20% Notes with a face amount of $250,000."
    print("\nTest 1: Toxic Debt Detection")
    print(f"Text: {test_text_1}")
    has_toxic, snippet = extractor.extract_toxic_debt(test_text_1)
    print(f"Result: has_toxic_debt={has_toxic}, snippet={snippet}")
    assert has_toxic == True, "Should detect 20% Notes as toxic debt"
    assert "20%" in snippet, "Snippet should contain 20%"
    
    # Test Case 2: Management Turnover
    test_text_2 = "Ernest Scheidemann, Chief Financial Officer, resigned on February 25, 2024."
    print("\nTest 2: Management Turnover Detection")
    print(f"Text: {test_text_2}")
    has_resignation, snippet = extractor.extract_management_turnover(test_text_2)
    print(f"Result: has_resignation={has_resignation}, snippet={snippet}")
    assert has_resignation == True, "Should detect CFO resignation"
    assert "resigned" in snippet.lower(), "Snippet should contain 'resigned'"
    
    # Test Case 3: Offering Amount
    test_text_3 = "Proposed Maximum Aggregate Offering Price: $15,000,000"
    print("\nTest 3: Offering Amount Extraction")
    print(f"Text: {test_text_3}")
    amount = extractor.extract_offering_amount(test_text_3)
    print(f"Result: offering_amount={amount}")
    assert amount == 15000000.0, f"Should extract $15,000,000 as 15000000.0, got {amount}"
    
    # Test Case 4: Warrant Coverage
    test_text_4 = "The offering includes warrant coverage of 100% of the shares."
    print("\nTest 4: Warrant Coverage Extraction")
    print(f"Text: {test_text_4}")
    coverage = extractor.extract_warrant_coverage(test_text_4)
    print(f"Result: warrant_coverage={coverage}")
    assert coverage == "100%", f"Should extract 100%, got {coverage}"
    
    # Test Case 5: All Signals Combined
    test_text_5 = """
    Proposed Maximum Aggregate Offering Price: $15,000,000
    
    The Company issued 20% Notes with a face amount of $250,000.
    
    Ernest Scheidemann, CFO, resigned on February 25, 2024.
    
    The offering includes warrant coverage of 100% of the shares.
    """
    print("\nTest 5: All Signals Combined")
    signals = extractor.extract_all_signals(test_text_5)
    print(f"Results: {signals}")
    assert signals['offering_amount'] == 15000000.0
    assert signals['high_interest_debt'] == True
    assert signals['resignation_detected'] == True
    assert signals['warrant_coverage'] == "100%"
    
    print("\n" + "=" * 60)
    print("✅ All test cases passed!")
    print("=" * 60)
