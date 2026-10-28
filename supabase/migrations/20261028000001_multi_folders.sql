-- Migration: Support multiple folders per bookmark (Bookmarks <-> Folders Many-to-Many)
-- 1. Create join table bookmark_folders
CREATE TABLE IF NOT EXISTS public.bookmark_folders (
    bookmark_id UUID NOT NULL REFERENCES public.bookmarks(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (bookmark_id, folder_id)
);

ALTER TABLE public.bookmark_folders ENABLE ROW LEVEL SECURITY;

-- 2. Migrate existing folder_id from bookmarks to bookmark_folders if any exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookmarks' AND column_name='folder_id') THEN
    INSERT INTO public.bookmark_folders (bookmark_id, folder_id)
    SELECT id, folder_id FROM public.bookmarks WHERE folder_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 3. RLS for bookmark_folders
CREATE POLICY "Users can view bookmark_folders if they can view the bookmark or folder"
ON public.bookmark_folders FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.bookmarks b WHERE b.id = bookmark_folders.bookmark_id AND b.owner_id = auth.uid())
    OR public.can_access_folder(folder_id)
);

CREATE POLICY "Bookmark owners can insert folder associations"
ON public.bookmark_folders FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (SELECT 1 FROM public.bookmarks b WHERE b.id = bookmark_folders.bookmark_id AND b.owner_id = auth.uid())
);

CREATE POLICY "Bookmark owners can delete folder associations"
ON public.bookmark_folders FOR DELETE
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.bookmarks b WHERE b.id = bookmark_folders.bookmark_id AND b.owner_id = auth.uid())
);

-- 4. Update bookmark SELECT policy to allow viewing if associated via bookmark_folders
DROP POLICY IF EXISTS "Users can view bookmarks they own or shared folder bookmarks" ON public.bookmarks;

CREATE POLICY "Users can view bookmarks they own or shared folder bookmarks"
ON public.bookmarks FOR SELECT
TO authenticated
USING (
    owner_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.bookmark_folders bf
        WHERE bf.bookmark_id = bookmarks.id AND public.can_access_folder(bf.folder_id)
    )
);
