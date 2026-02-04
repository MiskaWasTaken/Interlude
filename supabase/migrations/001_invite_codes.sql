-- Invite Codes Table
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(16) UNIQUE NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups on unused codes
CREATE INDEX idx_invite_codes_unused ON invite_codes(code) WHERE is_used = FALSE;

-- Enable RLS
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can check if a code exists (for validation)
CREATE POLICY "Anyone can validate invite codes" ON invite_codes
  FOR SELECT USING (true);

-- Policy: Only authenticated users can mark codes as used (and only unused codes)
CREATE POLICY "Authenticated users can use codes" ON invite_codes
  FOR UPDATE USING (auth.uid() IS NOT NULL AND is_used = FALSE)
  WITH CHECK (is_used = TRUE);

-- User Profiles Table (to track who signed up)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  invite_code_used VARCHAR(16) REFERENCES invite_codes(code),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Allow authenticated users to insert their own profile (for signup)
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Insert 100 invite codes
INSERT INTO invite_codes (code) VALUES
  ('HIFLAC-A1B2C3D4'),
  ('HIFLAC-E5F6G7H8'),
  ('HIFLAC-I9J0K1L2'),
  ('HIFLAC-M3N4O5P6'),
  ('HIFLAC-Q7R8S9T0'),
  ('HIFLAC-U1V2W3X4'),
  ('HIFLAC-Y5Z6A7B8'),
  ('HIFLAC-C9D0E1F2'),
  ('HIFLAC-G3H4I5J6'),
  ('HIFLAC-K7L8M9N0'),
  ('HIFLAC-O1P2Q3R4'),
  ('HIFLAC-S5T6U7V8'),
  ('HIFLAC-W9X0Y1Z2'),
  ('HIFLAC-A3B4C5D6'),
  ('HIFLAC-E7F8G9H0'),
  ('HIFLAC-I1J2K3L4'),
  ('HIFLAC-M5N6O7P8'),
  ('HIFLAC-Q9R0S1T2'),
  ('HIFLAC-U3V4W5X6'),
  ('HIFLAC-Y7Z8A9B0'),
  ('HIFLAC-C1D2E3F4'),
  ('HIFLAC-G5H6I7J8'),
  ('HIFLAC-K9L0M1N2'),
  ('HIFLAC-O3P4Q5R6'),
  ('HIFLAC-S7T8U9V0'),
  ('HIFLAC-W1X2Y3Z4'),
  ('HIFLAC-A5B6C7D8'),
  ('HIFLAC-E9F0G1H2'),
  ('HIFLAC-I3J4K5L6'),
  ('HIFLAC-M7N8O9P0'),
  ('HIFLAC-Q1R2S3T4'),
  ('HIFLAC-U5V6W7X8'),
  ('HIFLAC-Y9Z0A1B2'),
  ('HIFLAC-C3D4E5F6'),
  ('HIFLAC-G7H8I9J0'),
  ('HIFLAC-K1L2M3N4'),
  ('HIFLAC-O5P6Q7R8'),
  ('HIFLAC-S9T0U1V2'),
  ('HIFLAC-W3X4Y5Z6'),
  ('HIFLAC-A7B8C9D0'),
  ('HIFLAC-E1F2G3H4'),
  ('HIFLAC-I5J6K7L8'),
  ('HIFLAC-M9N0O1P2'),
  ('HIFLAC-Q3R4S5T6'),
  ('HIFLAC-U7V8W9X0'),
  ('HIFLAC-Y1Z2A3B4'),
  ('HIFLAC-C5D6E7F8'),
  ('HIFLAC-G9H0I1J2'),
  ('HIFLAC-K3L4M5N6'),
  ('HIFLAC-O7P8Q9R0'),
  ('HIFLAC-S1T2U3V4'),
  ('HIFLAC-W5X6Y7Z8'),
  ('HIFLAC-A9B0C1D2'),
  ('HIFLAC-E3F4G5H6'),
  ('HIFLAC-I7J8K9L0'),
  ('HIFLAC-M1N2O3P4'),
  ('HIFLAC-Q5R6S7T8'),
  ('HIFLAC-U9V0W1X2'),
  ('HIFLAC-Y3Z4A5B6'),
  ('HIFLAC-C7D8E9F0'),
  ('HIFLAC-G1H2I3J4'),
  ('HIFLAC-K5L6M7N8'),
  ('HIFLAC-O9P0Q1R2'),
  ('HIFLAC-S3T4U5V6'),
  ('HIFLAC-W7X8Y9Z0'),
  ('HIFLAC-A1B2C3E4'),
  ('HIFLAC-F5G6H7I8'),
  ('HIFLAC-J9K0L1M2'),
  ('HIFLAC-N3O4P5Q6'),
  ('HIFLAC-R7S8T9U0'),
  ('HIFLAC-V1W2X3Y4'),
  ('HIFLAC-Z5A6B7C8'),
  ('HIFLAC-D9E0F1G2'),
  ('HIFLAC-H3I4J5K6'),
  ('HIFLAC-L7M8N9O0'),
  ('HIFLAC-P1Q2R3S4'),
  ('HIFLAC-T5U6V7W8'),
  ('HIFLAC-X9Y0Z1A2'),
  ('HIFLAC-B3C4D5E6'),
  ('HIFLAC-F7G8H9I0'),
  ('HIFLAC-J1K2L3M4'),
  ('HIFLAC-N5O6P7Q8'),
  ('HIFLAC-R9S0T1U2'),
  ('HIFLAC-V3W4X5Y6'),
  ('HIFLAC-Z7A8B9C0'),
  ('HIFLAC-D1E2F3G4'),
  ('HIFLAC-H5I6J7K8'),
  ('HIFLAC-L9M0N1O2'),
  ('HIFLAC-P3Q4R5S6'),
  ('HIFLAC-T7U8V9W0'),
  ('HIFLAC-X1Y2Z3A4'),
  ('HIFLAC-B5C6D7E8'),
  ('HIFLAC-F9G0H1I2'),
  ('HIFLAC-J3K4L5M6'),
  ('HIFLAC-N7O8P9Q0'),
  ('HIFLAC-R1S2T3U4'),
  ('HIFLAC-V5W6X7Y8'),
  ('HIFLAC-Z9A0B1C2'),
  ('HIFLAC-D3E4F5G6'),
  ('HIFLAC-H7I8J9K0');
