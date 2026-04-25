import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptAskEdgarKey } from "@/lib/askedgarKeyEncryption";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";

export const runtime = "nodejs";

const KEY_MIN = 20;

function looksLikeAskEdgarKey(s: string): boolean {
  const t = s.trim();
  if (t.length < KEY_MIN) return false;
  return true;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ accountsEnabled: false, configured: false });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("user_askedgar_keys")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[user/askedgar-key][GET]", error);
    return NextResponse.json(
      { error: "Could not read key status" },
      { status: 500 }
    );
  }
  return NextResponse.json({ accountsEnabled: true, configured: Boolean(data) });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 }
    );
  }
  if (!process.env.ASKEDGAR_KEY_ENCRYPTION_SECRET?.trim()) {
    return NextResponse.json(
      {
        error: "Server missing ASKEDGAR_KEY_ENCRYPTION_SECRET (used only to encrypt keys at rest).",
      },
      { status: 503 }
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { key?: string };
  try {
    body = (await req.json()) as { key?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key : "";
  if (!looksLikeAskEdgarKey(key)) {
    return NextResponse.json(
      { error: "Key looks too short or invalid" },
      { status: 400 }
    );
  }
  const key_ciphertext = encryptAskEdgarKey(key.trim());
  const { error } = await supabase.from("user_askedgar_keys").upsert(
    {
      user_id: user.id,
      key_ciphertext,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.error("[user/askedgar-key][POST]", error);
    return NextResponse.json(
      { error: "Could not save key (is the table created? See supabase/migrations/)" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 }
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { error } = await supabase
    .from("user_askedgar_keys")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error("[user/askedgar-key][DELETE]", error);
    return NextResponse.json(
      { error: "Could not remove key" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
