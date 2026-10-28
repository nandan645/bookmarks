-- 1. Folders table
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    icon TEXT DEFAULT 'folder',
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Folder members / sharing table (share by email)
CREATE TABLE IF NOT EXISTS public.folder_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
    shared_with_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(folder_id, shared_with_email)
);

-- 3. Bookmarks table
CREATE TABLE IF NOT EXISTS public.bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    is_favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user has access to a folder
CREATE OR REPLACE FUNCTION public.can_access_folder(f_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folders f
    WHERE f.id = f_id AND f.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.folder_members fm
    WHERE fm.folder_id = f_id 
      AND LOWER(fm.shared_with_email) = LOWER(auth.jwt()->>'email')
  );
$$;

-- Helper function to check if current user can edit a folder (owner or editor)
CREATE OR REPLACE FUNCTION public.can_edit_folder(f_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folders f
    WHERE f.id = f_id AND f.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.folder_members fm
    WHERE fm.folder_id = f_id 
      AND LOWER(fm.shared_with_email) = LOWER(auth.jwt()->>'email')
      AND fm.role = 'editor'
  );
$$;

-- ====================
-- FOLDERS POLICIES
-- ====================
-- Select: user is owner or it is shared with user's email
CREATE POLICY "Users can view owned or shared folders"
ON public.folders FOR SELECT
TO authenticated
USING (
    owner_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.folder_members fm
        WHERE fm.folder_id = folders.id 
          AND LOWER(fm.shared_with_email) = LOWER(auth.jwt()->>'email')
    )
);

CREATE POLICY "Users can create their own folders"
ON public.folders FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Folder owners can update their folders"
ON public.folders FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Folder owners can delete their folders"
ON public.folders FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- ====================
-- FOLDER MEMBERS POLICIES
-- ====================
CREATE POLICY "Folder owners or invited members can view shares"
ON public.folder_members FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_members.folder_id AND f.owner_id = auth.uid())
    OR LOWER(shared_with_email) = LOWER(auth.jwt()->>'email')
);

CREATE POLICY "Folder owners can insert shares"
ON public.folder_members FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_members.folder_id AND f.owner_id = auth.uid())
);

CREATE POLICY "Folder owners can delete shares"
ON public.folder_members FOR DELETE
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_members.folder_id AND f.owner_id = auth.uid())
);

-- ====================
-- BOOKMARKS POLICIES
-- ====================
-- View: user owns it OR user has access to the folder it belongs to
CREATE POLICY "Users can view bookmarks they own or shared folder bookmarks"
ON public.bookmarks FOR SELECT
TO authenticated
USING (
    owner_id = auth.uid() OR
    (folder_id IS NOT NULL AND public.can_access_folder(folder_id))
);

-- Insert: user can add to own or to shared folder where they are editor
CREATE POLICY "Users can insert bookmarks"
ON public.bookmarks FOR INSERT
TO authenticated
WITH CHECK (
    owner_id = auth.uid() AND (
        folder_id IS NULL OR
        public.can_access_folder(folder_id)
    )
);

-- Update: owner or folder editor
CREATE POLICY "Users can update their bookmarks or bookmarks in editable folders"
ON public.bookmarks FOR UPDATE
TO authenticated
USING (
    owner_id = auth.uid() OR
    (folder_id IS NOT NULL AND public.can_edit_folder(folder_id))
);

-- Delete: owner
CREATE POLICY "Users can delete their bookmarks"
ON public.bookmarks FOR DELETE
TO authenticated
USING (owner_id = auth.uid());
