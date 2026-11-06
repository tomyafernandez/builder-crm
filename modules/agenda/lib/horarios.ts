/**
 * Calculo de horarios disponibles. PURO (sin base ni red): recibe la hora actual, la
 * zona horaria del negocio, el horario de atencion y lo ocupado, y devuelve huecos
 * reales. Las cuentas de zona horaria usan Intl, sin dependencias.
 */

export interface Intervalo {
  inicio: Date;
  fin: Date;
}

export interface AjustesHorario {
  /** 0 = domingo ... 6 = sabado */
  dias: number[];
  /** "HH:MM" en la zona del negocio */
  desde: string;
  hasta: string;
  duracionMin: number;
  anticipacionMin: number;
  diasAdelante: number;
}

export const AJUSTES_POR_DEFECTO: AjustesHorario & { titulo: string } = {
  dias: [1, 2, 3, 4, 5],
  desde: "10:00",
  hasta: "18:00",
  duracionMin: 30,
  anticipacionMin: 120,
  diasAdelante: 7,
  titulo: "Llamada",
};

function partes(fecha: Date, zona: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(fecha).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Diferencia (ms) entre la hora de pared en `zona` y UTC para ese instante. */
function desfase(fecha: Date, zona: string): number {
  const p = partes(fecha, zona);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(fecha.getTime() / 1000) * 1000;
}

/** El instante UTC que en `zona` se ve como ese dia y hora. */
export function instanteLocal(y: number, m: number, d: number, hhmm: string, zona: string): Date {
  const [h, mi] = hhmm.split(":").map(Number);
  const supuesto = Date.UTC(y, m - 1, d, h, mi);
  let t = supuesto - desfase(new Date(supuesto), zona);
  // Segunda pasada por si el desfase cambia ese dia (horario de verano).
  t = supuesto - desfase(new Date(t), zona);
  return new Date(t);
}

/** Fecha (y, m, d) de hoy en la zona, mas `n` dias. */
function diaLocal(ahora: Date, zona: string, n: number) {
  const p = partes(ahora, zona);
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), semana: base.getUTCDay() };
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function aHHMM(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const pisa = (a: Intervalo, b: Intervalo) => a.inicio < b.fin && b.inicio < a.fin;

/** Todos los huecos libres del rango, en orden. */
export function huecosLibres(input: {
  ahora: Date;
  zona: string;
  ajustes: AjustesHorario;
  ocupados: Intervalo[];
}): Intervalo[] {
  const { ahora, zona, ajustes, ocupados } = input;
  const limite = new Date(ahora.getTime() + ajustes.anticipacionMin * 60_000);
  const desde = minutos(ajustes.desde);
  const hasta = minutos(ajustes.hasta);
  const dur = Math.max(10, ajustes.duracionMin);
  const salida: Intervalo[] = [];
  for (let n = 0; n <= ajustes.diasAdelante; n++) {
    const dia = diaLocal(ahora, zona, n);
    if (!ajustes.dias.includes(dia.semana)) continue;
    for (let t = desde; t + dur <= hasta; t += dur) {
      const inicio = instanteLocal(dia.y, dia.m, dia.d, aHHMM(t), zona);
      const hueco = { inicio, fin: new Date(inicio.getTime() + dur * 60_000) };
      if (inicio < limite) continue;
      if (ocupados.some((o) => pisa(hueco, o))) continue;
      salida.push(hueco);
    }
  }
  return salida;
}

/**
 * Pocas opciones, repartidas: hasta dos por dia (una temprano y una mas tarde), en
 * los primeros dias con lugar. Ofrecer 30 horarios no ayuda a nadie a decidir.
 */
export function elegirOpciones(huecos: Intervalo[], zona: string, max = 4): Intervalo[] {
  const porDia = new Map<string, Intervalo[]>();
  for (const h of huecos) {
    const p = partes(h.inicio, zona);
    const clave = `${p.y}-${p.m}-${p.d}`;
    porDia.set(clave, [...(porDia.get(clave) ?? []), h]);
  }
  const salida: Intervalo[] = [];
  for (const lista of porDia.values()) {
    if (salida.length >= max) break;
    salida.push(lista[0]);
    if (lista.length > 2 && salida.length < max) salida.push(lista[Math.floor(lista.length / 2)]);
  }
  return salida.slice(0, max);
}

/** "jueves 13 de noviembre, 10:00" en la zona del negocio. */
export function etiquetaHorario(fecha: Date, zona: string): string {
  const dia = new Intl.DateTimeFormat("es-AR", { timeZone: zona, weekday: "long", day: "numeric", month: "long" }).format(fecha);
  const hora = new Intl.DateTimeFormat("es-AR", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(fecha);
  return `${dia}, ${hora}`;
}

/** true si `inicio` coincide (al minuto) con alguno de los ofrecidos. */
export function fueOfrecido(inicio: Date, ofrecidos: Intervalo[]): Intervalo | null {
  return ofrecidos.find((o) => Math.abs(o.inicio.getTime() - inicio.getTime()) < 60_000) ?? null;
}

/**
 * El agente no ve en el turno siguiente lo que devolvio una herramienta (el historial
 * guarda solo los mensajes), asi que para reservar dice el horario como lo ofrecio:
 * "lunes 9 de noviembre, 10:30", "el 9 a las 10:30", "10:30". Esto lo empareja con los
 * ofrecidos por dia del mes y hora local. Si es ambiguo, null: mejor volver a ofrecer
 * que reservar el equivocado.
 */
export function buscarOfrecidoPorTexto(texto: string, ofrecidos: Intervalo[], zona: string): Intervalo | null {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const iso = new Date(texto);
  if (/^\d{4}-\d{2}-\d{2}t/i.test(texto.trim()) && !Number.isNaN(iso.getTime())) return fueOfrecido(iso, ofrecidos);
  const mHora = t.match(/\b(\d{1,2})[:.](\d{2})\b/) ?? t.match(/\b(\d{1,2})\s*(?:hs|horas|h)\b/);
  if (!mHora) return null;
  const hh = Number(mHora[1]);
  const mm = Number(mHora[2] ?? 0);
  const sinHora = t.replace(mHora[0], " ");
  const mDia = sinHora.match(/\b([0-3]?\d)\b/);
  const dia = mDia ? Number(mDia[1]) : null;
  const candidatos = ofrecidos.filter((o) => {
    const p = partes(o.inicio, zona);
    return p.h === hh && p.mi === mm && (dia === null || p.d === dia);
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}
