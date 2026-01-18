#!/usr/bin/env python3
"""Quick script to check NBY 8-K filing content and see why details weren't extracted"""

import requests
import re
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from filing_parser import extract_text_from_html

url = 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1389545/000143774926001459/nby20260116_8k.htm'
headers = {
    'User-Agent': 'Short Seller Research Tool gdwoods@gmail.com',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

try:
    print("Fetching NBY 8-K filing...")
    response = requests.get(url, headers=headers, timeout=30)
    if response.status_code == 200:
        text = extract_text_from_html(response.text)
        
        print(f"\n=== FILING LENGTH: {len(text)} characters ===\n")
        
        # Look for offering-related keywords and context
        print("=== OFFERING-RELATED SECTIONS ===")
        offering_keywords = ['offering', 'shares', 'price', 'proceeds', 'purchase agreement', 'agreement', 'common stock']
        for keyword in offering_keywords:
            matches = list(re.finditer(rf'.{{0,300}}{re.escape(keyword)}.{{0,300}}', text, re.IGNORECASE))
            if matches:
                print(f"\n--- {keyword.upper()} ({len(matches)} matches) ---")
                for i, match in enumerate(matches[:2]):  # First 2 matches
                    snippet = match.group(0)
                    # Clean up whitespace
                    snippet = re.sub(r'\s+', ' ', snippet)
                    print(f"Match {i+1}: {snippet[:500]}...")
        
        # Check for dollar amounts
        print("\n=== DOLLAR AMOUNTS FOUND ===")
        dollar_pattern = r'\$[\d,]+(?:,\d{3})*(?:\.\d{2})?'
        dollar_matches = re.findall(dollar_pattern, text)
        unique_dollars = sorted(list(set(dollar_matches)), key=lambda x: len(x), reverse=True)[:15]
        print(unique_dollars)
        
        # Check for share counts
        print("\n=== SHARE COUNTS FOUND ===")
        share_patterns = [
            r'[\d,]+(?:,\d{3})*\s+shares?',
            r'[\d,]+(?:,\d{3})*\s+(?:million|billion|M|B)?\s*shares?',
        ]
        all_shares = []
        for pattern in share_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            all_shares.extend(matches)
        unique_shares = list(set(all_shares))[:15]
        print(unique_shares)
        
        # Check for specific patterns our parser looks for
        print("\n=== CHECKING PARSER PATTERNS ===")
        
        # Check for "preliminary prospectus" pattern
        prelim_match = re.search(r'(?:preliminary\s+prospectus|prospectus)[^$]*?\$([\d,]{7,}(?:,\d{3})*)', text[:100000], re.IGNORECASE | re.DOTALL)
        if prelim_match:
            print(f"Found preliminary prospectus pattern: ${prelim_match.group(1)}")
        else:
            print("No 'preliminary prospectus' pattern found")
        
        # Check for share price patterns
        price_patterns = [
            r'\$\d+\.\d{2}(?:\s*-\s*\$\d+\.\d{2})?\s*(?:per\s*)?share',
            r'price[:\s]*\$?\d+\.\d{2}(?:\s*-\s*\$?\d+\.\d{2})?',
        ]
        for pattern in price_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                print(f"Share price pattern found: {matches[:3]}")
                break
        else:
            print("No share price pattern found")
        
        # Show a larger snippet around "offering" or "purchase agreement"
        print("\n=== DETAILED CONTEXT AROUND KEY TERMS ===")
        context_terms = ['offering', 'purchase agreement', 'common stock purchase']
        for term in context_terms:
            match = re.search(rf'.{{0,1000}}{re.escape(term)}.{{0,1000}}', text, re.IGNORECASE | re.DOTALL)
            if match:
                context = match.group(0)
                context = re.sub(r'\s+', ' ', context)
                print(f"\n--- Context around '{term}' ---")
                print(context[:1000])
                break
        
    else:
        print(f"Failed to fetch filing: HTTP {response.status_code}")
        
except Exception as e:
    import traceback
    print(f'Error: {e}')
    traceback.print_exc()
