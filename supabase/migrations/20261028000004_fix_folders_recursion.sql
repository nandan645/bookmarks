-- Fix recursion between folders and folder_members
-- Drop mutually referencing policies
DROP POLICY IF EXISTS "Users can view owned or shared folders" ON public.folders;
DROP POLICY IF EXISTS "Folder owners or invited members can view shares" ON public.folder_members;
DROP POLICY IF EXISTS "Folder owners can insert shares" ON public.folder_members;
DROP POLICY IF EXISTS "Folder owners can delete shares" ON public.folder_members;

-- 1. Helper SECURITY DEFINER function to check if current authenticated user has folder access
CREATE OR REPLACE FUNCTION public.check_user_folder_shared(f_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folder_members fm
    WHERE fm.folder_id = f_id 
      AND LOWER(fm.shared_with_email) = LOWER(auth.jwt()->>'email')
  );
$$;

-- 2. Helper SECURITY DEFINER function to check if current user is folder owner
CREATE OR REPLACE FUNCTION public.check_is_folder_owner(f_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folders f
    WHERE f.id = f_id AND f.owner_id = auth.uid()
  );
$$;

-- 3. Re-create folders SELECT policy cleanly without recursive loop
CREATE POLICY "Users can view owned or shared folders"
ON public.folders FOR SELECT
TO authenticated
USING (
    owner_id = auth.uid() OR public.check_user_folder_shared(id)
);

-- 4. Re-create folder_members policies cleanly
CREATE POLICY "Folder owners or invited members can view shares"
ON public.folder_members FOR SELECT
TO authenticated
USING (
    public.check_is_folder_owner(folder_id)
    OR LOWER(shared_with_email) = LOWER(auth.jwt()->>'email')
);

CREATE POLICY "Folder owners can insert shares"
ON public.folder_members FOR INSERT
TO authenticated
WITH CHECK (
    public.check_is_folder_owner(folder_id)
);

CREATE POLICY "Folder owners can delete shares"
ON public.folder_members FOR DELETE
TO authenticated
USING (
    public.check_is_folder_owner(folder_id)
);
