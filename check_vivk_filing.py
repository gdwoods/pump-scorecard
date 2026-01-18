#!/usr/bin/env python3
"""Quick script to check VIVK 8-K filing content and see why offering amount/price weren't extracted"""

import requests
import re
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from filing_parser import extract_text_from_html, extract_offering_amount, extract_share_price, extract_number_of_shares

url = 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1450704/000182912626000381/vivakorinc_8k.htm'
headers = {
    'User-Agent': 'Short Seller Research Tool gdwoods@gmail.com',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

try:
    print("Fetching VIVK 8-K filing...")
    response = requests.get(url, headers=headers, timeout=30)
    if response.status_code == 200:
        text = extract_text_from_html(response.text)
        
        print(f"\n=== FILING LENGTH: {len(text)} characters ===\n")
        
        # Test our extraction functions
        print("=== EXTRACTION RESULTS ===")
        offering_amount = extract_offering_amount(text)
        share_price = extract_share_price(text)
        number_of_shares = extract_number_of_shares(text)
        
        print(f"Offering Amount: {offering_amount}")
        print(f"Share Price: {share_price}")
        print(f"Number of Shares: {number_of_shares}\n")
        
        # Look for context around "11,904,762" (the share count we found)
        print("=== CONTEXT AROUND SHARE COUNT ===")
        share_match = re.search(r'.{0,500}11,904,762.{0,500}', text, re.IGNORECASE)
        if share_match:
            context = share_match.group(0)
            context = re.sub(r'\s+', ' ', context)
            print(context[:1000])
        
        # Check for dollar amounts near share count
        print("\n=== DOLLAR AMOUNTS NEAR SHARE COUNT ===")
        # Look for $X within 500 chars of "11,904,762"
        dollar_pattern = r'.{0,500}11,904,762.{0,500}'
        context_match = re.search(dollar_pattern, text, re.IGNORECASE | re.DOTALL)
        if context_match:
            context = context_match.group(0)
            dollars = re.findall(r'\$[\d,]+(?:,\d{3})*(?:\.\d{2})?', context)
            print(f"Dollar amounts near share count: {dollars}")
        
        # Check for share price patterns
        print("\n=== SHARE PRICE PATTERNS ===")
        price_patterns = [
            r'\$\d+\.\d{2}(?:\s*-\s*\$\d+\.\d{2})?\s*(?:per\s*)?share',
            r'price[:\s]*\$?\d+\.\d{2}',
            r'(?:priced|sold|at)[:\s]*\$?\d+\.\d{2}',
            r'\$\d+\.\d{2}',
        ]
        for pattern in price_patterns:
            matches = re.findall(pattern, text[:20000], re.IGNORECASE)
            if matches:
                print(f"Pattern '{pattern}': {matches[:5]}")
                break
        
        # Show a snippet of the filing text
        print("\n=== FILING TEXT SNIPPET (first 3000 chars) ===")
        print(text[:3000])
        
    else:
        print(f"Failed to fetch filing: HTTP {response.status_code}")
        
except Exception as e:
    import traceback
    print(f'Error: {e}')
    traceback.print_exc()
