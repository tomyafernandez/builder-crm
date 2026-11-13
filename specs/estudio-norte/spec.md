# Spec: Demo "Estudio Norte"

**Carril**: ligero (configuracion + modulo de datos demo)
**Estado**: implementada
**Fecha**: 2026-11-13
**Escrita antes del codigo**: si (la decidio Tomas; esta es la version del repo)

## Problema

Levari necesita una demo publicada para grabar el video de venta (menos de 5 minutos) y
para las llamadas: el MISMO CRM que se instala, con el agente real y Google Calendar real.
Lo unico simulado: los canales (Simulador) y el pago de la sena (pagina de prueba).

## El negocio

- **Estudio Norte**, sin rubro: vende servicios con turno y cobra sena. Palermo, Buenos Aires.
- Moneda USD. Zona America/Argentina/Buenos_Aires. Lunes a sabado de 9 a 19, turnos de 60 min.
- Servicios: Primera consulta USD 40, Sesion individual USD 80, Plan mensual (4 sesiones) USD 280.
- Sena del 30%, 1 hora para pagarla; si no, se libera el horario. Recordatorio 24 h antes.
- Pipeline "Clientes": Nueva consulta -> Calificado -> Sena pendiente -> Turno confirmado ->
  Cliente (ganada) / Perdido (perdida).
- Campos: servicio de interes, para cuando, primera vez.
- Seguimiento a las 3 h y 22 h; no a quien espera la sena o ya tiene el turno.
- Retorno, con los numeros del caso de la web (levari-web/casos): 1,5 min por mensaje (~160 h
  al mes = una persona de jornada completa, sueldo de referencia USD 700; conservador a
  proposito), 15% de ausencia sin recordatorio. Las senas se muestran aparte y no suman.

## Donde vive

| Que | Donde |
|---|---|
| Marca, pipeline, campos, prompt, seguimiento, retorno | `config/cliente.ts` (rama `demo`) |
| Modulos | `config/modulos.json`: `agenda` + `estudio_norte` |
| Datos de 30 dias y ajustes de la agenda | `modules/estudio_norte/` (`seed`) |
| Logo e iconos | `public/marca/`, `public/icons/` (`npm run pwa:icons`) |
| Lo generico (sena, recordatorio, reagenda, tarjeta de retorno) | `main`, spec nucleo/19 |

## Lo que muestra la demo (en orden)

1. Responder al instante y calificar.
2. Turno con sena: horarios reales -> reserva -> link de pago -> pago -> turno confirmado y en Google Calendar.
3. Recordatorio pidiendo confirmacion; si quiere cambiar, el agente reagenda.
4. Seguimiento a quien dejo de responder.
5. Derivacion a una persona.
6. Panel con "Lo que te dejo el sistema".

## Criterios de aceptacion

- [x] `npm test && npm run typecheck && npm run lint && npm run build` en verde en `demo`.
- [x] El seed deja ~60 consultas por dia, ticket ~USD 79, ~160 h ahorradas (~USD 700), ~12
  turnos recuperados, ~USD 640 de ausencias evitadas y un total cercano a USD 2.100-2.300 en
  30 dias (la web dice ~USD 2.300). Varia unos cientos segun el dia en que se siembra.
- [ ] Recorrido completo en la demo publicada, con capturas.

## Constitution Check

- I. Nucleo: la rama `demo` no toca `src/` (salvo `src/app/apple-icon.png`, que genera `npm run pwa:icons`).
- II. Spec: esta.
- III. Autoverificacion: recorrido de la seccion 5 de la spec de Tomas en la URL publicada.
- IV. Secretos: solo en `.env.local` y en las variables de Vercel.

## Fuera de alcance

- Canales reales y Mercado Pago real.
- Marcar asistio / ausente desde la pantalla.
