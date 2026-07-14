import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export async function notify(
  supabase: SupabaseClient,
  userId: string,
  input: { type: string; title: string; message: string; data?: Record<string, unknown> },
) {
  await supabase.from('notifications').insert({
    user_id: userId,
    type: input.type,
    title: input.title,
    message: input.message,
    data: input.data ?? null,
  });
}