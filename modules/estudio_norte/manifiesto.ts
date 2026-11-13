import type { ManifiestoModulo } from "@/lib/modules/types";

/**
 * Datos de la demo "Estudio Norte" (rama `demo`). Sin menu ni tablas propias: solo el
 * `seed` que deja la agenda configurada y 30 dias de actividad coherentes con el caso
 * de la web de Levari. No se activa en ninguna instancia real.
 */
const manifiesto: ManifiestoModulo = {
  nombre: "estudio_norte",
  titulo: "Estudio Norte (demo)",
  descripcion: "Configuracion de la agenda y 30 dias de datos de demostracion.",
  version: "1.0.0",
};

export default manifiesto;
