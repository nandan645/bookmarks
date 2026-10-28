-- Migration: Create fixed Global folder and auto-assign all bookmarks
-- 1. Create a well-known constant UUID for the Global folder
-- e.g. '00000000-0000-0000-0000-000000000001'

-- 2. Ensure Global folder exists or is provisioned
-- Allow public access / all authenticated users to read and add to Global folder
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read system settings"
ON public.system_settings FOR SELECT
TO authenticated
USING (true);

-- 3. Trigger to auto-assign every new bookmark into user's own "Global" folder or a shared Global folder
-- Let's provide a trigger that whenever a bookmark is inserted, it automatically inserts into bookmark_folders for the user's Global folder.

-- Helper: Ensure user has a "Global" folder
CREATE OR REPLACE FUNCTION public.get_or_create_user_global_folder(u_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  g_id UUID;
BEGIN
  SELECT id INTO g_id
  FROM public.folders
  WHERE owner_id = u_id AND LOWER(name) = 'global'
  LIMIT 1;

  IF g_id IS NULL THEN
    INSERT INTO public.folders (name, color, owner_id)
    VALUES ('Global', '#18181b', u_id)
    RETURNING id INTO g_id;
  END IF;

  RETURN g_id;
END;
$$;

-- Trigger function to auto-link new bookmark to Global folder
CREATE OR REPLACE FUNCTION public.auto_link_to_global_folder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  g_id UUID;
BEGIN
  g_id := public.get_or_create_user_global_folder(NEW.owner_id);
  
  -- Insert into bookmark_folders if not already present
  INSERT INTO public.bookmark_folders (bookmark_id, folder_id)
  VALUES (NEW.id, g_id)
  ON CONFLICT (bookmark_id, folder_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_auto_link_global ON public.bookmarks;
CREATE TRIGGER tr_auto_link_global
AFTER INSERT ON public.bookmarks
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_to_global_folder();

-- Also retroactively ensure every existing user has a Global folder and link all their existing bookmarks to it
DO $$
DECLARE
  u RECORD;
  g_id UUID;
BEGIN
  FOR u IN SELECT DISTINCT owner_id FROM public.bookmarks LOOP
    g_id := public.get_or_create_user_global_folder(u.owner_id);
    
    INSERT INTO public.bookmark_folders (bookmark_id, folder_id)
    SELECT b.id, g_id
    FROM public.bookmarks b
    WHERE b.owner_id = u.owner_id
    ON CONFLICT (bookmark_id, folder_id) DO NOTHING;
  END LOOP;
END $$;
