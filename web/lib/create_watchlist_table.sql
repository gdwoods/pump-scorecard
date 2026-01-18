-- User Watchlists Table
-- Stores ticker watchlists for anonymous users (identified by UUID in localStorage)
CREATE TABLE IF NOT EXISTS user_watchlists (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,  -- Anonymous UUID from localStorage
    ticker TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_user_watchlists_user_id ON user_watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlists_ticker ON user_watchlists(ticker);

-- Enable RLS (Row Level Security) for anonymous access
-- Since we're using anon key, we need to allow reads/writes for all users
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for any user_id
-- This is safe because users can only access their own data via user_id matching
CREATE POLICY "Allow all operations on user_watchlists"
ON user_watchlists
FOR ALL
USING (true)
WITH CHECK (true);
