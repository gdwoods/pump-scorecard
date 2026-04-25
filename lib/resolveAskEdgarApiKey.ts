import { createClient } from "@/lib/supabase/server";
import { decryptAskEdgarKey } from "@/lib/askedgarKeyEncryption";
import { getAskEdgarApiKeyFromEnv } from "@/lib/topGainers";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";

export type AskEdgarKeyResolution =
  | { key: string; source: "user" | "env" }
  | { key: null; source: "none" };

/**
 * Prefer a logged-in user's stored key; otherwise server env. Used in API routes.
 */
export async function resolveAskEdgarApiKey(): Promise<AskEdgarKeyResolution> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (!userErr && user) {
        const { data, error } = await supabase
          .from("user_askedgar_keys")
          .select("key_ciphertext")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!error && data?.key_ciphertext) {
          try {
            const key = decryptAskEdgarKey(data.key_ciphertext as string);
            if (key.trim()) {
              return { key: key.trim(), source: "user" };
            }
          } catch (e) {
            console.error("[askedgar] decrypt failed", e);
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("not configured")) {
        /* fall through to env */
      } else {
        console.warn("[askedgar] user key resolution", e);
      }
    }
  }
  const env = getAskEdgarApiKeyFromEnv();
  if (env) return { key: env, source: "env" };
  return { key: null, source: "none" };
}
