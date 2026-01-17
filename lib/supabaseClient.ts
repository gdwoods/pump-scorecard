import { createClient } from '@supabase/supabase-js';

// Supabase connection for DilutionTracker database
const supabaseUrl = process.env.SUPABASE_URL || 'https://qnbobgnexagjlgzpeigb.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

// Create a single supabase client for interacting with DilutionTracker database
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We don't need session persistence for API calls
  },
});

export default supabase;
