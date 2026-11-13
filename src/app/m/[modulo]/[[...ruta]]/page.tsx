import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/team";
import { obtenerModulo, resolverPagina, resolverPaginaPublica } from "@/lib/modules";

export const dynamic = "force-dynamic";

/**
 * Catch-all de paginas de modulos: /m/<modulo>/<ruta...>.
 * El modulo declara sus paginas por patron en servidor.ts; aqui solo se resuelve, se
 * exige miembro y se delega. Modulo inactivo o ruta sin match -> 404.
 */
export default async function PaginaModuloRoute({
  params,
  searchParams,
}: {
  params: Promise<{ modulo: string; ruta?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { modulo: nombre, ruta = [] } = await params;
  const modulo = obtenerModulo(nombre);
  if (!modulo) notFound();

  // Spec nucleo/19: /m/<modulo>/publico/... sale SOLO de `paginasPublicas`, sin sesion.
  if (ruta[0] === "publico") {
    const pub = resolverPaginaPublica(modulo, ruta.slice(1));
    if (!pub) notFound();
    const Publica = pub.valor;
    return <Publica params={pub.params} searchParams={await searchParams} />;
  }

  const match = resolverPagina(modulo, ruta);
  if (!match) notFound();

  const member = await getCurrentMember();
  if (!member) redirect("/sin-acceso");

  const Pagina = match.valor;
  return <Pagina params={match.params} searchParams={await searchParams} member={member} />;
}
