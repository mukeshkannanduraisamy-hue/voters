import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zljnuohjdamuklalvxbp.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpsam51b2hqZGFtdWtsYWx2eGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNjMyNTEsImV4cCI6MjEwMTczOTI1MX0.N-WvuXMQvzFRycVUT_Qsten5qJvxPagdI8M5vSQXpqU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
