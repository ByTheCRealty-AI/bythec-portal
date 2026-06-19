// =============================================================================
// Middleware — renova a sessão (cookies) e PROTEGE todas as rotas do painel.
// =============================================================================
// Públicas: /login e /auth/* (callback do convite). Tudo o mais exige sessão.
// Sem sessão -> redireciona pra /login (guardando o destino em ?next=).
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PUBLIC_PREFIXES = ["/login", "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  // Links de e-mail no formato PKCE chegam com ?code=... em qualquer rota.
  // Encaminha pro callback (troca code -> sessão) e segue pra definir senha.
  const codeParam = request.nextUrl.searchParams.get("code");
  if (codeParam && !request.nextUrl.pathname.startsWith("/auth/")) {
    const cb = request.nextUrl.clone();
    cb.pathname = "/auth/callback";
    cb.search = "";
    cb.searchParams.set("code", codeParam);
    cb.searchParams.set("next", "/auth/set-password");
    return NextResponse.redirect(cb);
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem env (preview sem config): não trava o build/render; só não autentica.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANTE: getUser() revalida o token no servidor (não confiar só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Não logado tentando rota protegida -> /login?next=
  if (!user && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Já logado tentando /login -> manda pro painel.
  if (user && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  // Roda em tudo, menos estáticos/imagens/favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
