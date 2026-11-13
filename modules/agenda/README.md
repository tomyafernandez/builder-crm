# Modulo `agenda` — llamadas, turnos con sena y Google Calendar

El agente ofrece horarios LIBRES reales y agenda en uno de ellos. Con Google Calendar
conectado mira tu calendario antes de ofrecer y crea el evento con link de Meet (e
invita al cliente si dio su email). Sin Google funciona igual con tus horarios.

| Que | Donde |
|---|---|
| Menu | "Agenda" (Productividad) |
| Pagina | `/m/agenda`: proximas citas (con el estado de la sena), conexion con Google, horarios, servicios, sena y recordatorio, botones de prueba |
| Pagina publica | `/m/agenda/publico/pago/<id>`: pago de la sena (de prueba) para el cliente, sin login |
| API | `GET/PUT /api/m/agenda`, `POST /api/m/agenda/citas`, `POST /api/m/agenda/citas/<id>/cancelar`, `POST /api/m/agenda/probar`, `GET /api/m/agenda/google/conectar`, `GET .../google/callback`, `POST .../google/desconectar`, `POST /api/m/agenda/publico/pago/<id>` |
| Tablas | `agenda_citas`, `agenda_ofrecidos`, `agenda_ajustes` (`migrations/0000_agenda.sql` + `0001_sena_y_recordatorios.sql`, RLS) |
| Tools del agente | `agenda_ver_horarios`, `agenda_agendar`, `agenda_mis_turnos`, `agenda_confirmar_asistencia`, `agenda_reprogramar` |
| Barrido | reservas con sena vencidas y recordatorio del dia anterior (`lib/barrido.ts`) |
| Tarjeta de retorno | recuperado por seguimiento, ausencias evitadas (estimado), senas cobradas (`lib/metricas.ts`) |

Garantias: el agente solo puede reservar un horario que le OFRECIO a esa conversacion;
antes de reservar se vuelve a mirar que siga libre; y si Google falla al crear el
evento no hay cita (la herramienta devuelve error y el agente no puede confirmar).

## Turnos con sena (spec nucleo/19)

Todo se configura en Agenda (admin) y arranca apagado, asi que una instancia que
actualiza queda igual que antes:

- **Servicios** con precio (y duracion opcional). Con servicios cargados, el agente tiene
  que decir cual se agenda; nunca inventa un precio.
- **Sena** en % del precio (vacio = sin sena) y **plazo** para pagarla (60 min). Con sena,
  la reserva queda `pendiente_sena`: ocupa el horario hasta que vence, el agente manda el
  link de pago y, al pagar, el turno se confirma, se crea el evento en Google y se le
  escribe al cliente. Si no paga, el barrido la pasa a `vencida`, libera el horario y le
  ofrece otro.
- **Recordatorio** (apagado por defecto): una vez, cuando faltan N horas (24), entre las 9
  y las 21 del negocio, pidiendo confirmacion. Fuera de la ventana de 24 h solo con la
  plantilla de WhatsApp indicada.
- **Etapas**: si el pipeline tiene las claves `sena_pendiente` y `turno_confirmado`, la
  agenda mueve la operacion ahi (con el precio como valor). Si no las tiene, no mueve nada.
- **Pago**: `proveedor_pago = 'simulado'` (pagina de prueba). Mercado Pago es el siguiente
  paso (`lib/pagos.ts`, interfaz `crearCobro` / `verificarCobro`).
- **Probar sin esperar**: "Probar recordatorios ahora" y "Vencer reservas ahora" solo tocan
  contactos creados en el Simulador.

## Conectar Google Calendar (gratis, una vez por instancia)

1. [Google Cloud Console](https://console.cloud.google.com/) -> proyecto nuevo.
2. **APIs y servicios -> Biblioteca**: habilitar **Google Calendar API**.
3. **Pantalla de consentimiento de OAuth**: tipo Externo; agrega tu correo como usuario
   de prueba. **Publicala ("En produccion")**: en modo prueba Google vence el acceso a los
   7 dias. Sin verificar, Google muestra "app no verificada": como solo la usas vos, se
   acepta con "Avanzado -> Ir a ...".
4. **Credenciales -> ID de cliente de OAuth -> Aplicacion web**. URI de redireccionamiento:
   `https://<tu-dominio>/api/m/agenda/google/callback` (exacta, con APP_BASE_URL).
5. Variables de la instancia: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`
   (y `ENCRYPTION_KEY`, porque el acceso se guarda cifrado). Redesplegar.
6. En el CRM: Agenda -> **Conectar Google Calendar** (como admin).

## Activar

`config/modulos.json` -> `"activos": [..., "agenda"]` y redesplegar (la migracion corre sola).
