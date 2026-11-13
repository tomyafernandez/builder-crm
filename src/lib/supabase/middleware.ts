import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { modoLocal } from "@/lib/modo-local";
import { opcionesDeCookie } from "@/lib/supabase/cookies";

// `/correo` sirve las plantillas de los correos de acceso: las descarga el servidor de
// autenticacion, que no tiene sesion en el CRM. Son plantillas vacias, sin datos.
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/sin-acceso", "/correo"];
// `/api/automations/process` es el sweeper (lo llama el cron con secreto); el resto
// de /api/automations exige sesion.
// Rutas con autenticacion propia (secreto del worker o admin con sesion, resuelto en
// la ruta): el middleware no las manda a /login.
const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/webhooks",
  "/api/agent",
  "/api/automations/process",
  "/api/seguimientos/process",
  "/api/modulos/barridos",
  "/api/simulador",
  "/api/laboratorio",
  "/api/seed",
];

/**
 * Spec nucleo/19: paginas y API publicas de modulo. SOLO el segmento `publico` justo
 * despues del nombre del modulo; el despachador ademas las sirve desde `paginasPublicas`
 * / `apiPublica`, nunca desde las paginas con login.
 */
const RUTA_PUBLICA_MODULO = /^\/(?:api\/)?m\/[a-z][a-z0-9_]*\/publico(?:\/|$)/;

export function esRutaPublicaDeModulo(pathname: string): boolean {
  return RUTA_PUBLICA_MODULO.test(pathname);
}

export async function updateSession(request: NextRequest) {
  // Modo local: no hay servidor de autenticacion al que preguntarle. Sin esta salida,
  // `createServerClient` recibe undefined y TODA peticion muere antes de renderizar;
  // eso es lo que hacia que el CRM no abriera sin un proyecto de Supabase.
  if (modoLocal()) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: opcionesDeCookie(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims y no getUser: verifica la firma del token sin ir al servidor de Auth en
  // cada pedido (con claves de firma asimetricas usa el JWKS en cache; con la clave
  // vieja cae solo a getUser). getUser sumaba un viaje de red a CADA clic.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!user && !isPublicPath && !isPublicApi && !esRutaPublicaDeModulo(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
