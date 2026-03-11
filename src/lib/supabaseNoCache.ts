// Supabase client with cache disabled for fresh data
import { createClient } from '@supabase/supabase-js';

// Create Supabase client with no-cache configuration
export const supabaseNoCache = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
    global: {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Supabase-Cache-Buster': Date.now().toString()
      },
      fetch: (url, options = {}) => {
        // Add cache-busting parameters to all requests
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const separator = url.includes('?') ? '&' : '?';
        const bustUrl = `${url}${separator}_t=${timestamp}&_r=${random}&_cb=${Date.now()}`;
        
        console.log(`🔄 Supabase uncached request: ${bustUrl}`);
        
        return fetch(bustUrl, {
          ...options,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'If-None-Match': '',
            'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
            ...options.headers,
          }
        });
      }
    }
  }
);

// Helper function to make uncached queries
export const queryNoCache = async (tableName: string, query: any) => {
  console.log(`🔄 Making no-cache query to ${tableName}`);
  
  // Add timestamp to force fresh query
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  
  // Execute query with fresh timestamp
  const result = await query.eq('__cache_buster__', null).or(`__cache_buster__.is.null,__cache_buster__.eq.${timestamp}`);
  
  console.log(`✅ No-cache query completed for ${tableName}:`, result);
  return result;
};

export default supabaseNoCache;
