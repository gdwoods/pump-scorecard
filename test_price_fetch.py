"""
Test script to debug price fetching for specific tickers
"""

from price_filter import fetch_current_stock_price

# Test tickers
test_tickers = ['AREB', 'KMB', 'AAPL', 'TSLA', 'HLXC']

print("Testing price fetching...")
print("=" * 60)

for ticker in test_tickers:
    price = fetch_current_stock_price(ticker)
    print(f"{ticker}: ${price:.2f}" if price else f"{ticker}: Could not fetch price")
    print()
