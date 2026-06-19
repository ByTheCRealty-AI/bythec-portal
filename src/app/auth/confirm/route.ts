// =============================================================================
// Auth confirm — handles e-mail OTP links (invite / recovery / magic link).
// Supabase e-mail links carry `token_hash` + `type`. We verify them here, which
// SETS the session cookies, then send the person to set their password.
// (The `code` PKCE flow lives in ../callback/route.ts.)
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/auth/set-password";

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?reason=link-expired`);
}
