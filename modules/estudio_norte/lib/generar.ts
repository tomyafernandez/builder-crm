/**
 * Genera 30 dias de actividad de Estudio Norte. PURO (sin base): recibe la hora actual y
 * devuelve filas listas para insertar. Numeros pensados para el caso de la web de Levari:
 * unas 60 consultas por dia, ticket cercano a USD 80 y un retorno del orden de USD 2.000
 * a 2.500 por mes. Todo inventado y etiquetado `demo`.
 */

export const SERVICIOS = [
  { nombre: "Primera consulta", precioCentavos: 4000, peso: 43 },
  { nombre: "Sesión individual", precioCentavos: 8000, peso: 50 },
  { nombre: "Plan mensual (4 sesiones)", precioCentavos: 28000, peso: 7 },
];
const CAMPO_SERVICIO: Record<string, string> = {
  "Primera consulta": "Primera consulta",
  "Sesión individual": "Sesión individual",
  "Plan mensual (4 sesiones)": "Plan mensual",
};

const NOMBRES = ["Lucía", "Martina", "Sofía", "Valentina", "Camila", "Julieta", "Agustina", "Florencia", "Micaela", "Carolina", "Paula", "Victoria", "Rocío", "Belén", "Milagros", "Antonella", "Delfina", "Josefina", "Mariana", "Natalia", "Juan", "Matías", "Nicolás", "Santiago", "Tomás", "Facundo", "Federico", "Lucas", "Martín", "Gonzalo", "Ignacio", "Joaquín", "Franco", "Agustín", "Diego", "Pablo", "Ezequiel", "Leandro", "Sebastián", "Bruno"];
const APELLIDOS = ["González", "Rodríguez", "Gómez", "Fernández", "López", "Díaz", "Martínez", "Pérez", "García", "Sánchez", "Romero", "Sosa", "Álvarez", "Torres", "Ruiz", "Ramírez", "Flores", "Acosta", "Benítez", "Medina", "Herrera", "Suárez", "Aguirre", "Giménez", "Gutiérrez", "Pereyra", "Rojas", "Molina", "Castro", "Ortiz", "Silva", "Núñez", "Luna", "Juárez", "Cabrera", "Ríos", "Ferreyra", "Godoy", "Morales", "Domínguez"];

const ABRE = [
  "Hola! cuánto sale una sesión?",
  "Buenas, tienen turno esta semana?",
  "Hola, quería info de los planes",
  "Hola, cómo es la primera consulta?",
  "Precio de la sesión individual?",
  "Hola! vi su publicación, tienen lugar el sábado?",
  "Buen día, hacen planes mensuales?",
  "Hola, me pasás precios?",
  "Hola! me recomendó una amiga, cómo hago para sacar turno?",
  "Buenas tardes, tienen algo para mañana?",
];

/** PRNG con semilla: la misma demo cada vez. */
function mulberry32(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Buenos Aires: UTC-3 todo el ano (sin horario de verano).
const OFFSET_H = 3;
function partesBA(t: number) {
  const d = new Date(t - OFFSET_H * 3600_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours() };
}
function instanteBA(y: number, m: number, d: number, h: number, min = 0) {
  return Date.UTC(y, m, d, h + OFFSET_H, min);
}
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechaLarga(t: number) {
  const p = partesBA(t);
  const hh = String(p.h).padStart(2, "0");
  return `${DIAS[p.dow]} ${p.d} de ${MESES[p.m]} a las ${hh}:00`;
}
function fechaCorta(t: number) {
  const p = partesBA(t);
  return `${DIAS[p.dow]} ${p.d} a las ${String(p.h).padStart(2, "0")}:00`;
}
const usd = (c: number) => `USD ${Math.round(c / 100)}`;

export interface Msg {
  dir: "in" | "out";
  origen?: "agent" | "human";
  body: string;
  at: number;
  seguimiento?: number;
}

export interface Fila {
  i: number;
  nombre: string;
  canal: "whatsapp" | "instagram";
  telefono: string | null;
  creada: number;
  campos: Record<string, string>;
  mensajes: Msg[];
  etapa: string | null;
  valor: number;
  derivada: boolean;
  cita: null | {
    servicio: string;
    precio: number;
    sena: number;
    inicio: number;
    estado: "asistio" | "ausente" | "cancelada" | "vencida" | "confirmada" | "pendiente_sena";
    creada: number;
    senaVence: number;
    senaPagada: number | null;
    recordatorio: number | null;
    confirmo: number | null;
    recuperada: boolean;
  };
}

export function generar(ahoraMs: number, urlPago: (i: number) => string, semilla = 20261113): Fila[] {
  const r = mulberry32(semilla);
  const elegir = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const servicio = () => {
    let x = r() * 100;
    for (const s of SERVICIOS) {
      if ((x -= s.peso) < 0) return s;
    }
    return SERVICIOS[1];
  };
  const ocupados = new Set<number>();
  const filas: Fila[] = [];
  let i = 0;

  for (let k = 29; k >= 0; k--) {
    const dia = partesBA(ahoraMs - k * 86_400_000);
    const n = 52 + Math.floor(r() * 17); // 52 a 68 por dia
    for (let j = 0; j < n; j++) {
      // Mas consultas a la tarde y a la noche, como en un WhatsApp real.
      const hora = 8 + Math.floor(Math.pow(r(), 0.8) * 14);
      const creada = instanteBA(dia.y, dia.m, dia.d, hora, Math.floor(r() * 60));
      if (creada > ahoraMs - 15 * 60_000) continue;
      const canal = r() < 0.7 ? "whatsapp" : "instagram";
      const nombre = `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`;
      const s = servicio();
      const fila: Fila = {
        i: i++,
        nombre,
        canal,
        telefono: canal === "whatsapp" ? `+54 9 11 5${String(100 + Math.floor(r() * 900))}-${String(1000 + Math.floor(r() * 9000))}` : null,
        creada,
        campos: {},
        mensajes: [],
        etapa: null,
        valor: 0,
        derivada: false,
        cita: null,
      };
      const m = (dir: Msg["dir"], body: string, min: number, extra: Partial<Msg> = {}) => {
        const at = creada + min * 60_000;
        if (at <= ahoraMs - 60_000) fila.mensajes.push({ dir, body, at, origen: dir === "out" ? "agent" : undefined, ...extra });
      };
      const precios = `La sesión individual sale USD 80, la primera consulta USD 40 y el plan mensual de 4 sesiones USD 280. Es tu primera vez con nosotros?`;
      const seguir = (desde: number) => {
        m("out", "Te quedó alguna duda con los precios? Si querés te paso los horarios libres de esta semana.", desde + 180, { seguimiento: 1 });
        m("out", "Te dejo la puerta abierta: cuando quieras coordinamos un turno, tenemos lugar de lunes a sábado.", desde + 22 * 60, { seguimiento: 2 });
      };
      const x = r();
      const viejoDias = (ahoraMs - creada) / 86_400_000;

      if (x < 0.075) {
        // Reservo. Un 13% de las reservas sale de una conversacion recuperada por el seguimiento.
        const recuperada = r() < 0.13;
        m("in", elegir(ABRE), 0);
        m("out", precios, 1);
        let t = 3;
        if (recuperada) {
          m("out", "Te quedó alguna duda con los precios? Si querés te paso los horarios libres de esta semana.", 180, { seguimiento: 1 });
          t = 180 + 25 + Math.floor(r() * 120);
          m("in", "Sí! perdón, me colgué. Tenés algo para esta semana?", t);
        } else {
          m("in", elegir(["Sí, primera vez", "No, ya fui una vez", "Primera vez sí. Esta semana se puede?"]), t);
        }
        // Turno de 1 a 6 dias despues, lunes a sabado de 9 a 18, sin pisarse.
        let inicio = 0;
        for (let intento = 0; intento < 40 && !inicio; intento++) {
          const d = partesBA(creada + (1 + Math.floor(r() * 6)) * 86_400_000);
          if (d.dow === 0) continue;
          const cand = instanteBA(d.y, d.m, d.d, 9 + Math.floor(r() * 10));
          if (!ocupados.has(cand)) inicio = cand;
        }
        if (!inicio) continue;
        ocupados.add(inicio);
        const otro1 = inicio - 3 * 3600_000;
        const otro2 = inicio + 26 * 3600_000;
        m("out", `Te paso lo que tengo: ${fechaCorta(otro1)}, ${fechaCorta(inicio)} o ${fechaCorta(otro2)}. Cuál te queda mejor?`, t + 1);
        m("in", `${fechaCorta(inicio).replace(" a las", ",")} me sirve`, t + 4);
        const sena = Math.round((s.precioCentavos * 30) / 100);
        const reservada = creada + (t + 5) * 60_000;
        m("out", `Listo, te reservé ${s.nombre.toLowerCase()} el ${fechaLarga(inicio)}. La seña es ${usd(sena)} y la pagás acá, tenés 1 hora: ${urlPago(fila.i)}`, t + 5);

        let estado: NonNullable<Fila["cita"]>["estado"];
        let pagada: number | null = null;
        let recordatorio: number | null = null;
        let confirmo: number | null = null;
        const vence = reservada + 60 * 60_000;
        if (vence > ahoraMs && r() < 0.6) {
          estado = "pendiente_sena";
        } else if (r() < 0.1) {
          estado = "vencida";
          m("out", `Como no llegó la seña, liberé el horario del ${fechaLarga(inicio)}. Si querés, te busco otro horario que te quede cómodo.`, t + 65);
        } else {
          pagada = reservada + (8 + Math.floor(r() * 40)) * 60_000;
          if (pagada > ahoraMs) pagada = ahoraMs - 60_000;
          fila.mensajes.push({ dir: "out", origen: "agent", body: `Recibimos tu seña, tu turno de ${s.nombre.toLowerCase()} quedó confirmado para el ${fechaLarga(inicio)}. Te esperamos.`, at: pagada + 20_000 });
          const rec = inicio - (22 + Math.floor(r() * 2)) * 3600_000;
          if (rec < ahoraMs && rec > pagada) {
            recordatorio = rec;
            fila.mensajes.push({ dir: "out", origen: "agent", body: `Hola ${nombre.split(" ")[0]}, te recuerdo tu turno de ${s.nombre.toLowerCase()} mañana a las ${String(partesBA(inicio).h).padStart(2, "0")}:00. Me confirmás que venís?`, at: rec });
            if (r() < 0.75) {
              confirmo = rec + (10 + Math.floor(r() * 90)) * 60_000;
              if (confirmo < ahoraMs) {
                fila.mensajes.push({ dir: "in", body: elegir(["Sí, voy!", "Sí, ahí estaré", "Confirmo, gracias!", "Sí sí, voy"]), at: confirmo });
                fila.mensajes.push({ dir: "out", origen: "agent", body: "Genial, te esperamos!", at: confirmo + 30_000 });
              } else confirmo = null;
            }
          }
          if (inicio > ahoraMs) estado = "confirmada";
          else {
            const y = r();
            estado = confirmo ? (y < 0.97 ? "asistio" : "ausente") : y < 0.82 ? "asistio" : y < 0.94 ? "ausente" : "cancelada";
          }
        }
        fila.cita = { servicio: s.nombre, precio: s.precioCentavos, sena, inicio, estado, creada: reservada, senaVence: vence, senaPagada: pagada, recordatorio, confirmo, recuperada };
        fila.campos = { servicio_interes: CAMPO_SERVICIO[s.nombre], primera_vez: s.nombre === "Primera consulta" ? "Sí" : "No", para_cuando: "Esta semana" };
        fila.etapa = { asistio: "cliente", ausente: "perdido", cancelada: "perdido", vencida: "perdido", confirmada: "turno_confirmado", pendiente_sena: "sena_pendiente" }[estado];
        fila.valor = s.precioCentavos;
      } else if (x < 0.13) {
        // Recuperada por el seguimiento, todavia sin turno.
        m("in", elegir(ABRE), 0);
        m("out", precios, 1);
        m("out", "Te quedó alguna duda con los precios? Si querés te paso los horarios libres de esta semana.", 180, { seguimiento: 1 });
        m("in", elegir(["Perdón, me colgué. Para cuándo hay?", "Sí, la semana que viene puede ser", "Hola! sí, todavía me interesa"]), 200 + Math.floor(r() * 300));
        m("out", "Tranqui! Cuando tengas el día te paso los horarios libres. Para cuándo lo estarías buscando?", 520);
        m("in", "Lo veo y te aviso", 540);
        m("out", "Dale, cualquier cosa me escribís.", 541);
        fila.campos = { servicio_interes: CAMPO_SERVICIO[s.nombre], para_cuando: "La semana que viene" };
        fila.etapa = "calificado";
        fila.valor = s.precioCentavos;
      } else if (x < 0.33) {
        // Calificado sin reservar.
        m("in", elegir(ABRE), 0);
        m("out", precios, 1);
        m("in", elegir(["Sí, primera vez", "No, ya fui"]), 4);
        m("out", "Genial. Para cuándo lo estarías buscando?", 5);
        m("in", elegir(["Más adelante, el mes que viene", "No sé todavía, lo estoy viendo", "En dos semanas más o menos"]), 9);
        m("out", "Perfecto. Cuando quieras te paso los horarios libres.", 10);
        seguir(10);
        fila.campos = { servicio_interes: CAMPO_SERVICIO[s.nombre], para_cuando: "Más adelante" };
        // Los de mas de dos semanas ya no estan en el tablero (no se cargan como perdidos
        // para no llenar el pipeline de tarjetas viejas).
        fila.etapa = viejoDias <= 14 ? "calificado" : null;
        fila.valor = s.precioCentavos;
      } else if (x < 0.35) {
        // Derivada a una persona.
        fila.derivada = viejoDias < 1;
        m("in", elegir(["Hola, me cobraron la seña dos veces", "Quiero hablar con alguien por un problema con mi turno", "Tuve un problema la última vez, necesito hablar con alguien"]), 0);
        m("out", "Te paso con alguien del equipo que te ayuda con esto. En un ratito te escribe.", 1);
        if (!fila.derivada) m("out", "Hola, soy Caro de Estudio Norte. Ya lo revisé y quedó resuelto. Perdón por la molestia!", 35, { origen: "human" });
      } else if (x < 0.45) {
        // Pregunta puntual y listo.
        m("in", elegir(["Hola, dónde quedan?", "Aceptan tarjeta?", "Qué días atienden?"]), 0);
        m("out", "Estamos en Palermo, de lunes a sábado de 9 a 19, y se paga en efectivo, transferencia o tarjeta. Querés que te pase horarios?", 1);
        m("in", "No por ahora, gracias!", 6);
        m("out", "De nada! Cuando quieras.", 7);
      } else {
        // Pregunto el precio y no volvio.
        m("in", elegir(ABRE), 0);
        m("out", precios, 1);
        seguir(1);
        if (viejoDias < 3) {
          fila.etapa = "nueva_consulta";
          fila.valor = s.precioCentavos;
        }
      }
      if (fila.mensajes.length > 0) filas.push(fila);
    }
  }
  return filas;
}
