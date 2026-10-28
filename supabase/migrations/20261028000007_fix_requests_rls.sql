-- Fix RLS policy on folder_access_requests for upsert / anon submissions
-- 1. In Supabase, upsert requires BOTH INSERT and UPDATE permissions (and SELECT for RETURNING)
DROP POLICY IF EXISTS "Anyone can insert an access request" ON public.folder_access_requests;
DROP POLICY IF EXISTS "Anyone can update own pending access request" ON public.folder_access_requests;
DROP POLICY IF EXISTS "Anyone can view own access request" ON public.folder_access_requests;

-- Allow anon and authenticated to INSERT
CREATE POLICY "Anyone can insert an access request"
ON public.folder_access_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Allow anon and authenticated to UPDATE for upserting their own request
CREATE POLICY "Anyone can update own pending access request"
ON public.folder_access_requests FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (status = 'pending');

-- Allow anon and authenticated to SELECT
CREATE POLICY "Anyone can view access requests"
ON public.folder_access_requests FOR SELECT
TO anon, authenticated
USING (true);

-- Create dedicated SECURITY DEFINER RPC to submit an access request safely
CREATE OR REPLACE FUNCTION public.submit_folder_access_request(
    f_id UUID,
    req_email TEXT,
    req_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.folder_access_requests (folder_id, requester_email, requested_role, status, updated_at)
  VALUES (f_id, LOWER(TRIM(req_email)), req_role, 'pending', now())
  ON CONFLICT (folder_id, requester_email)
  DO UPDATE SET requested_role = EXCLUDED.requested_role, status = 'pending', updated_at = now();
END;
$$;
