# Spec: Barridos y metricas de modulos, agenda con sena y tarjeta de retorno

**Carril**: completo (cambia el contrato de modulos, agrega una migracion de modulo y un barrido que escribe a clientes)
**Estado**: implementada
**Fecha**: 2026-11-13
**Escrita antes del codigo**: si

## Problema

Un negocio que vende servicios con turno pierde plata en tres lugares que el CRM ya ve
pero no cubre: la reserva que nadie paga y bloquea un horario, el cliente que falta sin
avisar y el que pregunto y no volvio. Y el dueno no ve cuanto le deja el sistema: los
reportes cuentan mensajes, no plata.

Ademas, lo que depende del tiempo (recordatorios, vencer reservas) vive en un modulo, y el
contrato de modulos no tenia como correr algo periodico ni como aportar al panel.

## Decisiones

### A. Contrato de modulos (`src/lib/modules/types.ts`)

- D1. `ModuloServidor.barrido?(opciones: { soloSimulador?, ignorarEspera? }) => Promise<ResultadoBarrido>`.
  Lo corren: `src/lib/barridos.ts` (Coolify, cada SWEEP_INTERVAL_MIN), el endpoint
  `GET /api/modulos/barridos` (secreto del worker; cron de Vercel y GitHub Actions) y los
  botones de prueba de cada modulo. Un modulo que falla no frena a los demas.
- D2. `ModuloServidor.metricasPanel?(dias, contexto) => Promise<MetricaRetorno[]>`: lineas
  que el modulo aporta a la tarjeta de retorno. `contexto` trae los supuestos de
  `config.retorno` y las conversaciones recuperadas por el seguimiento (las mide el nucleo).
- D3. Un modulo inactivo no entra al registro: no corre barridos ni aporta metricas.
- D4. Paginas y API publicas de modulo: `/m/<modulo>/publico/...` y
  `/api/m/<modulo>/publico/...` (`paginasPublicas`, `apiPublica`). El middleware deja
  pasar SOLO ese prefijo sin sesion y el despachador no exige miembro. El segmento
  `publico` hace visible en la URL que no hay login. (La spec de la demo pedia
  `/m/agenda/pago/[id]`; queda `/m/agenda/publico/pago/[id]` por esto.)
- D5. Modo prueba: `soloSimulador` toca solo contactos creados desde /simulador
  (`source = 'simulador'`), no los datos demo: los botones de prueba no le escriben a
  cientos de contactos sembrados. `ignorarEspera` vale solo junto con `soloSimulador`.

### B. Agenda con sena, recordatorio y reagenda (`modules/agenda/`, migracion `0001`)

- D6. `agenda_ajustes`: `servicios` (jsonb `[{ nombre, precioCentavos, duracionMin? }]`),
  `sena_porcentaje` (null = sin sena), `sena_plazo_min` (60), `recordatorio_activo`
  (false), `recordatorio_horas_antes` (24), `recordatorio_plantilla`, `proveedor_pago`
  (`simulado` | `mercadopago`). Todo con default que deja a una instancia ya desplegada
  igual que antes (sin servicios, sin sena, sin recordatorio).
- D7. `agenda_citas`: `servicio`, `precio_centavos`, `sena_centavos`, `sena_vence_at`,
  `sena_pagada_at`, `pago_referencia`, `recordatorio_enviado_at`,
  `confirmada_por_cliente_at`. Estados: `agendada` (sin sena), `pendiente_sena`,
  `confirmada`, `vencida`, `cancelada`, `asistio`, `ausente`, `realizada` (viejo).
- D8. Ocupa horario: todo menos `cancelada` y `vencida`; una `pendiente_sena` sin pagar
  con el plazo cumplido ya NO ocupa, aunque el barrido todavia no la haya pasado a
  `vencida` (el horario no depende de que corra el cron).
- D9. `agenda_agendar` recibe `servicio`. Con servicios configurados es obligatorio (si no
  coincide, devuelve la lista). Con sena: cita `pendiente_sena`, vence en
  `sena_plazo_min`, la operacion pasa a la etapa `sena_pendiente` (si existe), con el
  precio como valor, y devuelve el link de pago. Sin sena: confirma como antes. La sena es
  `round(precio * porcentaje / 100)` en centavos.
- D10. Proveedor de pago: interfaz `crearCobro` / `verificarCobro`. `simulado` hoy;
  `mercadopago` declarado y sin implementar (falla claro si se elige).
- D11. Pago simulado: `/m/agenda/publico/pago/[id]` con servicio, dia y hora, sena y la
  aclaracion "Pago de prueba". Al pagar: sena pagada, evento en Google (si esta
  conectado), cita `confirmada`, etapa `turno_confirmado` (si existe) y mensaje al cliente
  por `deliverMessage`. Si Google falla: la sena queda registrada, la cita NO se confirma,
  la conversacion se deriva a una persona y al cliente se le dice que el equipo le
  confirma. Reserva vencida o cancelada: no se cobra.
- D12. Barrido del modulo:
  - Vencidas: `pendiente_sena` sin pagar y con plazo cumplido -> `vencida`, y un mensaje
    amable ofreciendo otro horario (solo dentro de la ventana de 24 h).
  - Recordatorio: citas `confirmada` o `agendada`, una sola vez, cuando faltan
    `recordatorio_horas_antes` o menos, antes del inicio y dentro de 09:00-21:00 en la
    zona del negocio. Texto dentro de la ventana de 24 h; fuera, en WhatsApp con
    `recordatorio_plantilla` y en Instagram/Messenger nada (como el seguimiento).
  - Hasta 20 envios por corrida. Todo sale por `deliverMessage`.
- D13. Tools nuevas: `agenda_mis_turnos`, `agenda_confirmar_asistencia` (marca
  `confirmada_por_cliente_at`) y `agenda_reprogramar` (solo a un horario ofrecido, revalida,
  conserva la sena y mueve el evento de Google; si Google falla no cambia nada).
- D14. Pantalla de Agenda: estado de la sena por cita, servicios y sena editables, y los
  botones "Probar recordatorios ahora" y "Vencer reservas ahora" (D5).
- D15. Siguen valiendo las tres garantias: solo horarios ofrecidos, revalidar antes de
  reservar y nunca confirmar si Google falla.

### C. Tarjeta "Lo que te dejo el sistema" (`src/lib/retorno.ts`)

- D16. `config.retorno = { activo: false, minutosPorMensaje: 3, tasaAusencia: 0.15 }`.
  Apagada por defecto: una instancia sin estos supuestos no muestra numeros inventados.
- D17. Ultimos 30 dias, cada linea con su cuenta escrita y "estimado" donde lo sea:
  - Horas ahorradas (nucleo) = mensajes del agente x minutos por mensaje / 60.
  - Recuperado por seguimiento (agenda) = turnos (no cancelados ni vencidos) de
    conversaciones recuperadas x precio del servicio.
  - Ausencias evitadas, estimado (agenda) = turnos confirmados por el cliente despues del
    recordatorio x tasa de ausencia x precio.
  - Senas cobradas (agenda): se muestra aparte, debajo del total, y NO suma (es parte del
    precio del mismo turno; sumarla contaria dos veces). En pantalla no se explica: solo la
    etiqueta y su cuenta.
  - Total en la moneda de la instancia = suma de las lineas que suman.
- D18. Se excluyen los contactos del simulador y del laboratorio, igual que en Reportes.
- D19. Solo la ve un admin.

## Criterios de aceptacion

- [x] Tests puros, sin base ni red (`tests/agenda-sena.test.ts`, `tests/retorno.test.ts`):
  disponibilidad con reservas pendientes, pagadas y vencidas; vencimiento; cuando toca el
  recordatorio (zona horaria, ventana, horario, una sola vez); calculo de la sena; texto
  relativo del dia; calculo de la tarjeta de retorno.
- [x] `npm test && npm run typecheck && npm run lint && npm run build` en verde.
- [x] Una instancia que actualiza sin tocar su configuracion queda igual: sin servicios no
  se pide servicio, sin sena no hay cobro, recordatorio apagado y tarjeta apagada.
- [ ] Recorrido completo en una instancia publicada (rama `demo`, Estudio Norte).

## Constitution Check

- I. Nucleo: el cambio es generico (contrato de modulos, rutas publicas, tarjeta de
  retorno) y sale en una version (2.6.0). Lo de cada negocio (servicios, sena, etapas,
  supuestos) va en la agenda y en `config/cliente.ts`.
- II. Spec: esta, escrita antes del codigo.
- III. Autoverificacion: tests puros + recorrido en una instancia publicada (rama demo).
- IV. Secretos: ninguno nuevo. La pagina de pago no expone datos del contacto.

## Fuera de alcance

- Mercado Pago real (`proveedor_pago = 'mercadopago'`): siguiente paso.
- Servicios de distinta duracion en la grilla de horarios (la grilla usa `duracion_min`).
- Marcar `asistio` / `ausente` desde la pantalla (hoy por datos o a mano en la base).
