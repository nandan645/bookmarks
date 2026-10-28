// Supabase Project Configuration
const SUPABASE_URL = "https://cvskwkdzrvuethscdnrc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2c2t3a2R6cnZ1ZXRoc2NkbnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjczNTQsImV4cCI6MjEwODc0MzM1NH0.UOqEIRO_PhtKLCSECAj2LBn0SvAukNKSjRox4e_8plk";

const supabaseLib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);

if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
  console.error("Supabase client library failed to load");
}

const supabaseClient = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;
