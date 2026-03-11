// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Client-side Supabase client (for browser)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-side Supabase client (for API routes)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Auth helper
export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};
