-- ====================================================================
-- MOCK.AI — SUPABASE AUTH & PROFILES TRIGGER FIX
-- Run this script in the Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. Ensure the user_role ENUM type exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('TEACHER', 'STUDENT', 'LEARNER');
  END IF;
END $$;

-- 2. Ensure public.profiles table exists with proper schema
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone_number TEXT DEFAULT '',
  role public.user_role NOT NULL DEFAULT 'LEARNER'::public.user_role,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Enable RLS on profiles and configure policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop obsolete or conflicting policies
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users and triggers" ON public.profiles;
DROP POLICY IF EXISTS "Allow profile creation" ON public.profiles;

-- Allow authenticated users to view profiles
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Allow profile creation during registration/triggers
CREATE POLICY "Allow profile creation"
  ON public.profiles FOR INSERT
  TO authenticated, anon, service_role
  WITH CHECK (true);

-- Allow users to update only their own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Create resilient handle_new_user function
-- Uses SECURITY DEFINER with explicit search_path and exception fallback
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_name TEXT;
BEGIN
  -- Safely extract and cast the role
  BEGIN
    v_role := (NEW.raw_user_meta_data->>'role')::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'LEARNER'::public.user_role;
  END;

  -- Safely extract full name
  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    split_part(COALESCE(NEW.email, 'Scholar'), '@', 1),
    'Scholar'
  );

  -- Upsert into public.profiles
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    phone_number,
    role,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_name,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(v_role, 'LEARNER'::public.user_role),
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone_number = EXCLUDED.phone_number,
    role = EXCLUDED.role,
    updated_at = timezone('utc'::text, now());

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Critical safeguard: Even if profile creation encounters an error,
  -- never abort user registration in auth.users
  RAISE WARNING 'handle_new_user error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 5. Bind trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
