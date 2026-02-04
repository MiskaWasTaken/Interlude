-- Add new fields to user_profiles
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS uid INTEGER UNIQUE,
  ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS total_listening_time INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tracks_played INTEGER DEFAULT 0;

-- Create a sequence for UID
CREATE SEQUENCE IF NOT EXISTS user_uid_seq START 1;

-- Function to auto-assign UID on profile creation
CREATE OR REPLACE FUNCTION assign_user_uid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.uid IS NULL THEN
    NEW.uid := nextval('user_uid_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign UID
DROP TRIGGER IF EXISTS assign_uid_trigger ON user_profiles;
CREATE TRIGGER assign_uid_trigger
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_user_uid();

-- Update existing profiles with UIDs if any exist without them
DO $$
DECLARE
  profile RECORD;
  counter INTEGER := 1;
BEGIN
  FOR profile IN SELECT id FROM user_profiles WHERE uid IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE user_profiles SET uid = counter WHERE id = profile.id;
    counter := counter + 1;
  END LOOP;
  -- Update the sequence to continue from the last used number
  IF counter > 1 THEN
    PERFORM setval('user_uid_seq', counter - 1);
  END IF;
END $$;
