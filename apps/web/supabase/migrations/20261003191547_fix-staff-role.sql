-- NOTE (relocated 2026-10-31): moved verbatim from repo-root supabase/migrations/ during cleanup.
-- WARNING: one-off operational script, NEVER applied to production. It uses ALTER TABLE ... DISABLE TRIGGER ALL
-- and SECURITY DEFINER to force a staff role + confirm an email. Review/rewrite before any migration run.
-- Create a SECURITY DEFINER function to bypass RLS triggers
CREATE OR REPLACE FUNCTION public.update_staff_role_bypass()
RETURNS void AS $$
BEGIN
  -- Disable trigger temporarily
  ALTER TABLE profiles DISABLE TRIGGER ALL;
  
  -- Update the role
  UPDATE profiles 
  SET role = 'staff' 
  WHERE id IN (
    SELECT id FROM auth.users WHERE email = 'staff@chinasuuq.com'
  );
  
  -- Confirm the email
  UPDATE auth.users 
  SET email_confirmed_at = NOW() 
  WHERE email = 'staff@chinasuuq.com';
  
  -- Re-enable triggers
  ALTER TABLE profiles ENABLE TRIGGER ALL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Call the function
SELECT public.update_staff_role_bypass();

-- Verify
SELECT 
  au.email,
  p.full_name,
  p.role,
  au.email_confirmed_at
FROM auth.users au
JOIN profiles p ON p.id = au.id
WHERE au.email = 'staff@chinasuuq.com';
