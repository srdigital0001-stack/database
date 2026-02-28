import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://boqnsdrkrvanulmxxfye.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvcW5zZHJrcnZhanVsbXh4ZnlleSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzQwNzU4NDAwLCJleHAiOjIwNTYzMTg0MDB9.placeholder';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials missing from environment, using defaults.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
