"""
Test Supabase Connection

This script tests the connection to your Supabase database.
Run it after setting SUPABASE_URL and SUPABASE_KEY environment variables.

Usage:
    export SUPABASE_URL="https://your-project.supabase.co"
    export SUPABASE_KEY="your-anon-key"
    python test_supabase_connection.py
"""

import os
import sys
from pathlib import Path

# Try to load from .env.local if it exists
env_file = Path(__file__).parent.parent / '.env.local'
if env_file.exists():
    print(f"Loading from {env_file}...")
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                # Check for various Supabase key names
                if 'SUPABASE_URL' in key.upper():
                    os.environ['SUPABASE_URL'] = value
                elif 'SUPABASE' in key.upper() and ('KEY' in key.upper() or 'ANON' in key.upper()):
                    os.environ['SUPABASE_KEY'] = value

from supabase_storage import init_supabase

print("=" * 60)
print("Supabase Connection Test")
print("=" * 60)
print()

# Check environment variables (support multiple naming conventions)
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not url:
    print("❌ SUPABASE_URL not found")
    print("   Set it with: export SUPABASE_URL='https://your-project.supabase.co'")
    print("   Or add to .env.local: SUPABASE_URL=https://your-project.supabase.co")
    sys.exit(1)

if not key:
    print("❌ SUPABASE_KEY/SUPABASE_ANON_KEY not found")
    print("   Set it with: export SUPABASE_ANON_KEY='your-anon-key'")
    print("   Or add to .env.local: SUPABASE_ANON_KEY=your-anon-key")
    sys.exit(1)

print(f"✅ SUPABASE_URL: {url}")
masked_key = "*" * 20 + key[-4:] if len(key) > 4 else "*" * len(key)
print(f"✅ SUPABASE_KEY: {masked_key}")
print()

# Test connection
print("Connecting to Supabase...")
print("-" * 60)

try:
    client = init_supabase()
    
    if not client:
        print("❌ Failed to initialize Supabase client")
        sys.exit(1)
    
    print("✅ Client initialized successfully!")
    print()
    
    # Test tables
    print("Testing tables...")
    print("-" * 60)
    
    tables_tested = 0
    tables_exist = 0
    
    # Test dilution_alerts
    tables_tested += 1
    try:
        result = client.table('dilution_alerts').select('id', count='exact').limit(1).execute()
        count = getattr(result, 'count', len(result.data) if hasattr(result, 'data') else 0)
        print(f"✅ dilution_alerts: {count} records")
        tables_exist += 1
    except Exception as e:
        error_msg = str(e).lower()
        if 'relation' in error_msg or 'does not exist' in error_msg or '42p01' in error_msg:
            print("⚠️  dilution_alerts: Table doesn't exist")
            print("   → Run the SQL schema from supabase_storage.py")
        else:
            print(f"⚠️  dilution_alerts: {e}")
    
    # Test company_universe
    tables_tested += 1
    try:
        result = client.table('company_universe').select('id', count='exact').limit(1).execute()
        count = getattr(result, 'count', len(result.data) if hasattr(result, 'data') else 0)
        print(f"✅ company_universe: {count} records")
        tables_exist += 1
    except Exception as e:
        error_msg = str(e).lower()
        if 'relation' in error_msg or 'does not exist' in error_msg or '42p01' in error_msg:
            print("⚠️  company_universe: Table doesn't exist")
            print("   → Run the SQL schema from supabase_storage.py")
        else:
            print(f"⚠️  company_universe: {e}")
    
    print()
    print("=" * 60)
    if tables_exist == tables_tested:
        print("✅ All tables exist! Supabase is ready to use.")
    elif tables_exist > 0:
        print(f"⚠️  {tables_exist}/{tables_tested} tables exist")
        print("   Create missing tables using the SQL schema in supabase_storage.py")
    else:
        print("⚠️  No tables found")
        print("   Create tables using the SQL schema in supabase_storage.py")
    print("=" * 60)
    
except ImportError as e:
    print(f"❌ Error: {e}")
    print("   Install with: pip install supabase")
    sys.exit(1)
except Exception as e:
    print(f"❌ Connection error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
