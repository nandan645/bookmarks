// Supabase Project Configuration
const SUPABASE_URL = "https://cvskwkdzrvuethscdnrc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2c2t3a2R6cnZ1ZXRoc2NkbnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjczNTQsImV4cCI6MjEwODc0MzM1NH0.UOqEIRO_PhtKLCSECAj2LBn0SvAukNKSjRox4e_8plk";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
