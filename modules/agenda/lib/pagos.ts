import "server-only";

/**
 * Cobro de la sena (spec nucleo/19). Una interfaz y un proveedor por archivo: hoy
 * `simulado` (pagina de pago de prueba del propio CRM); `mercadopago` queda declarado
 * para el siguiente paso y falla claro si alguien lo elige antes.
 */

export interface DatosCobro {
  citaId: string;
  montoCentavos: number;
  moneda: string;
  descripcion: string;
}

export interface ProveedorPago {
  id: "simulado" | "mercadopago";
  /** Devuelve el link que el agente le manda al cliente. */
  crearCobro(datos: DatosCobro): Promise<{ url: string; referencia: string }>;
  /** Consulta si el cobro se acredito. */
  verificarCobro(referencia: string): Promise<{ pagado: boolean }>;
}

export function urlBase(): string {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

const simulado: ProveedorPago = {
  id: "simulado",
  async crearCobro({ citaId }) {
    return { url: `${urlBase()}/m/agenda/publico/pago/${citaId}`, referencia: `sim:${citaId}` };
  },
  // La pagina de prueba marca la sena pagada al tocar el boton: no hay nada que consultar
  // afuera. El estado real lo tiene la cita (`sena_pagada_at`).
  async verificarCobro() {
    return { pagado: true };
  },
};

const mercadopago: ProveedorPago = {
  id: "mercadopago",
  async crearCobro() {
    throw new Error("Mercado Pago todavia no esta implementado en la agenda: usa proveedor_pago = 'simulado'.");
  },
  async verificarCobro() {
    throw new Error("Mercado Pago todavia no esta implementado en la agenda.");
  },
};

export function proveedorPago(id: string | null | undefined): ProveedorPago {
  return id === "mercadopago" ? mercadopago : simulado;
}
