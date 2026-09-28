-- ==============================================================================
-- MOCK.AI — OPTIMIZE PROFILES PHONE LOOKUP INDEX
-- Purpose: Accelerate unique phone number validation during registration.
-- Eliminates sequential table scans on public.profiles.
--
-- Run in: Supabase Project 1 Dashboard → SQL Editor → Run
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone 
  ON public.profiles(phone_number) 
  WHERE phone_number IS NOT NULL AND phone_number != '';
