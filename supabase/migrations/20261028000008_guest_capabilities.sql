-- Migration: RPCs for Guest shared folders and links management

-- 1. Get all folders shared with a guest email (from anyone)
CREATE OR REPLACE FUNCTION public.get_guest_shared_folders(guest_email TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  color TEXT,
  icon TEXT,
  role TEXT,
  owner_email TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    f.id,
    f.name,
    f.color,
    f.icon,
    fm.role,
    u.email as owner_email
  FROM public.folder_members fm
  JOIN public.folders f ON f.id = fm.folder_id
  JOIN auth.users u ON u.id = f.owner_id
  WHERE LOWER(TRIM(fm.shared_with_email)) = LOWER(TRIM(guest_email))
  ORDER BY f.created_at ASC;
$$;

-- 2. Allow guest with 'editor' role to insert a bookmark into a shared folder
CREATE OR REPLACE FUNCTION public.guest_add_bookmark(
  f_id UUID,
  guest_email TEXT,
  bm_url TEXT,
  bm_title TEXT,
  bm_desc TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  f_owner_id UUID;
  new_bm_id UUID;
  user_role TEXT;
BEGIN
  -- Verify guest has editor role in folder
  SELECT fm.role, f.owner_id INTO user_role, f_owner_id
  FROM public.folder_members fm
  JOIN public.folders f ON f.id = fm.folder_id
  WHERE fm.folder_id = f_id AND LOWER(TRIM(fm.shared_with_email)) = LOWER(TRIM(guest_email));

  IF user_role IS NULL OR user_role != 'editor' THEN
    RAISE EXCEPTION 'You must have Editor role to add links to this folder';
  END IF;

  -- Create bookmark under the folder owner's id
  INSERT INTO public.bookmarks (owner_id, url, title, description)
  VALUES (f_owner_id, bm_url, bm_title, bm_desc)
  RETURNING id INTO new_bm_id;

  -- Link bookmark to the shared folder
  INSERT INTO public.bookmark_folders (bookmark_id, folder_id)
  VALUES (new_bm_id, f_id);

  RETURN new_bm_id;
END;
$$;

-- 3. Allow guest with 'editor' role to edit a bookmark in a shared folder
CREATE OR REPLACE FUNCTION public.guest_update_bookmark(
  bm_id UUID,
  f_id UUID,
  guest_email TEXT,
  bm_url TEXT,
  bm_title TEXT,
  bm_desc TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT fm.role INTO user_role
  FROM public.folder_members fm
  JOIN public.bookmark_folders bf ON bf.folder_id = fm.folder_id
  WHERE bf.bookmark_id = bm_id 
    AND bf.folder_id = f_id 
    AND LOWER(TRIM(fm.shared_with_email)) = LOWER(TRIM(guest_email));

  IF user_role IS NULL OR user_role != 'editor' THEN
    RAISE EXCEPTION 'You must have Editor role to edit links in this folder';
  END IF;

  UPDATE public.bookmarks
  SET url = bm_url, title = bm_title, description = bm_desc, updated_at = now()
  WHERE id = bm_id;
END;
$$;

-- 4. Allow guest with 'editor' role to delete a bookmark from a shared folder
CREATE OR REPLACE FUNCTION public.guest_delete_bookmark(
  bm_id UUID,
  f_id UUID,
  guest_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT fm.role INTO user_role
  FROM public.folder_members fm
  JOIN public.bookmark_folders bf ON bf.folder_id = fm.folder_id
  WHERE bf.bookmark_id = bm_id 
    AND bf.folder_id = f_id 
    AND LOWER(TRIM(fm.shared_with_email)) = LOWER(TRIM(guest_email));

  IF user_role IS NULL OR user_role != 'editor' THEN
    RAISE EXCEPTION 'You must have Editor role to delete links in this folder';
  END IF;

  DELETE FROM public.bookmarks WHERE id = bm_id;
END;
$$;
