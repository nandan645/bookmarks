-- Fix infinite recursion in RLS policies
-- When bookmarks SELECT checked bookmark_folders, and bookmark_folders SELECT checked bookmarks, Postgres hit infinite recursion.

-- 1. Drop the circular policies
DROP POLICY IF EXISTS "Users can view bookmarks they own or shared folder bookmarks" ON public.bookmarks;
DROP POLICY IF EXISTS "Users can view bookmark_folders if they can view the bookmark or folder" ON public.bookmark_folders;
DROP POLICY IF EXISTS "Bookmark owners can insert folder associations" ON public.bookmark_folders;
DROP POLICY IF EXISTS "Bookmark owners can delete folder associations" ON public.bookmark_folders;

-- 2. Create a SECURITY DEFINER helper function to check bookmark ownership without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_bookmark_owner(b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookmarks
    WHERE id = b_id AND owner_id = auth.uid()
  );
$$;

-- 3. Create a SECURITY DEFINER helper to check if a bookmark is in a folder accessible to the user
CREATE OR REPLACE FUNCTION public.can_access_bookmark_via_folder(b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookmark_folders bf
    JOIN public.folders f ON f.id = bf.folder_id
    WHERE bf.bookmark_id = b_id
      AND (
        f.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.folder_members fm
          WHERE fm.folder_id = f.id
            AND LOWER(fm.shared_with_email) = LOWER(auth.jwt()->>'email')
        )
      )
  );
$$;

-- 4. Re-create bookmarks SELECT policy using the helper (no recursion)
CREATE POLICY "Users can view bookmarks they own or shared folder bookmarks"
ON public.bookmarks FOR SELECT
TO authenticated
USING (
    owner_id = auth.uid() OR public.can_access_bookmark_via_folder(id)
);

-- 5. Re-create bookmark_folders policies using the helper
CREATE POLICY "Users can view bookmark_folders"
ON public.bookmark_folders FOR SELECT
TO authenticated
USING (
    public.is_bookmark_owner(bookmark_id) OR public.can_access_folder(folder_id)
);

CREATE POLICY "Bookmark owners can insert folder associations"
ON public.bookmark_folders FOR INSERT
TO authenticated
WITH CHECK (
    public.is_bookmark_owner(bookmark_id)
);

CREATE POLICY "Bookmark owners can delete folder associations"
ON public.bookmark_folders FOR DELETE
TO authenticated
USING (
    public.is_bookmark_owner(bookmark_id)
);
