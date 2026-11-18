import { partirEnlaces } from "@/lib/enlaces";
import { cn } from "@/lib/utils";

/**
 * Cuerpo de un mensaje con sus links clickeables (spec nucleo/20): `[texto](url)` se ve
 * como "texto" y una URL suelta se ve acortada. Abre en otra pestana.
 */
export function TextoConEnlaces({ texto, className }: { texto: string; className?: string }) {
  return (
    <>
      {partirEnlaces(texto).map((t, i) =>
        t.tipo === "texto" ? (
          <span key={i}>{t.valor}</span>
        ) : (
          <a
            key={i}
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            title={t.url}
            className={cn("font-medium underline underline-offset-2 break-all", className)}
          >
            {t.texto}
          </a>
        )
      )}
    </>
  );
}
