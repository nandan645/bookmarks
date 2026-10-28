-- Migration: Access Requests and Shareable Folder URL with Approval Workflow

-- 1. Create table for folder access requests
CREATE TABLE IF NOT EXISTS public.folder_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
    requester_email TEXT NOT NULL,
    requested_role TEXT NOT NULL DEFAULT 'viewer' CHECK (requested_role IN ('viewer', 'editor')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(folder_id, requester_email)
);

ALTER TABLE public.folder_access_requests ENABLE ROW LEVEL SECURITY;

-- 2. Allow unauthenticated / anon visitors to submit an access request
CREATE POLICY "Anyone can insert an access request"
ON public.folder_access_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 3. Allow folder owner to view and manage access requests for their folders
CREATE POLICY "Folder owners can view requests"
ON public.folder_access_requests FOR SELECT
TO authenticated
USING (
    public.check_is_folder_owner(folder_id)
);

CREATE POLICY "Folder owners can update requests"
ON public.folder_access_requests FOR UPDATE
TO authenticated
USING (
    public.check_is_folder_owner(folder_id)
);

CREATE POLICY "Folder owners can delete requests"
ON public.folder_access_requests FOR DELETE
TO authenticated
USING (
    public.check_is_folder_owner(folder_id)
);

-- 4. Enable public reading of folders by id ONLY for metadata (name, owner email) so unauthorized users can see "Request Access to [Folder Name]"
CREATE OR REPLACE FUNCTION public.get_folder_public_info(f_id UUID)
RETURNS TABLE (id UUID, name TEXT, owner_email TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT f.id, f.name, u.email as owner_email
  FROM public.folders f
  JOIN auth.users u ON u.id = f.owner_id
  WHERE f.id = f_id;
$$;

-- 5. Helper function for folder owner to approve request with specified role
CREATE OR REPLACE FUNCTION public.approve_folder_request(request_id UUID, granted_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  req RECORD;
BEGIN
  -- Verify caller is owner
  SELECT far.*, f.owner_id INTO req
  FROM public.folder_access_requests far
  JOIN public.folders f ON f.id = far.folder_id
  WHERE far.id = request_id;

  IF req IS NULL OR req.owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to approve this request';
  END IF;

  -- Insert or update folder_members
  INSERT INTO public.folder_members (folder_id, shared_with_email, role)
  VALUES (req.folder_id, LOWER(TRIM(req.requester_email)), granted_role)
  ON CONFLICT (folder_id, shared_with_email)
  DO UPDATE SET role = EXCLUDED.role;

  -- Update request status
  UPDATE public.folder_access_requests
  SET status = 'approved', updated_at = now()
  WHERE id = request_id;
END;
$$;

-- 6. Helper function to check if an email has access to a folder
CREATE OR REPLACE FUNCTION public.check_email_folder_access(f_id UUID, check_email TEXT)
RETURNS TABLE (has_access BOOLEAN, role TEXT, folder_name TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    true as has_access,
    fm.role,
    f.name as folder_name
  FROM public.folder_members fm
  JOIN public.folders f ON f.id = fm.folder_id
  WHERE fm.folder_id = f_id AND LOWER(TRIM(fm.shared_with_email)) = LOWER(TRIM(check_email))
  LIMIT 1;
$$;

-- 7. Helper to get bookmarks for a shared folder for authorized guest email
CREATE OR REPLACE FUNCTION public.get_shared_folder_bookmarks(f_id UUID, guest_email TEXT)
RETURNS TABLE (
  id UUID,
  title TEXT,
  url TEXT,
  description TEXT,
  is_favorite BOOLEAN,
  created_at TIMESTAMPTZ,
  role TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    b.id,
    b.title,
    b.url,
    b.description,
    b.is_favorite,
    b.created_at,
    fm.role
  FROM public.bookmark_folders bf
  JOIN public.bookmarks b ON b.id = bf.bookmark_id
  JOIN public.folder_members fm ON fm.folder_id = bf.folder_id
  WHERE bf.folder_id = f_id AND LOWER(TRIM(fm.shared_with_email)) = LOWER(TRIM(guest_email));
$$;
