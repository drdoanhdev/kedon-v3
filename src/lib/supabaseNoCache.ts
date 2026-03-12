// Supabase client (shared instance, no heavy cache-busting)
import { createClient } from '@supabase/supabase-js';

export const supabaseNoCache = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
  }
);

export default supabaseNoCache;
