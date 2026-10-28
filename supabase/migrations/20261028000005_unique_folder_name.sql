-- Migration: Disallow duplicate folder names per user (case-insensitive)
-- 1. Deduplicate any existing duplicate folders (keeping earliest)
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY owner_id, LOWER(TRIM(name))
        ORDER BY created_at ASC
      ) as rn
      FROM public.folders
    ) t
    WHERE t.rn > 1
  LOOP
    DELETE FROM public.folders WHERE id = dup.id;
  END LOOP;
END $$;

-- 2. Add unique constraint per owner and lowercase trimmed name
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_unique_owner_name 
ON public.folders (owner_id, LOWER(TRIM(name)));
