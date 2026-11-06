# Modulo `agenda` — llamadas y citas con Google Calendar

El agente ofrece horarios LIBRES reales y agenda en uno de ellos. Con Google Calendar
conectado mira tu calendario antes de ofrecer y crea el evento con link de Meet (e
invita al cliente si dio su email). Sin Google funciona igual con tus horarios.

| Que | Donde |
|---|---|
| Menu | "Agenda" (Productividad) |
| Pagina | `/m/agenda`: proximas citas, conexion con Google, horarios de atencion |
| API | `GET/PUT /api/m/agenda`, `POST /api/m/agenda/citas`, `POST /api/m/agenda/citas/<id>/cancelar`, `GET /api/m/agenda/google/conectar`, `GET .../google/callback`, `POST .../google/desconectar` |
| Tablas | `agenda_citas`, `agenda_ofrecidos`, `agenda_ajustes` (`migrations/0000_agenda.sql`, RLS) |
| Tools del agente | `agenda_ver_horarios`, `agenda_agendar` |

Garantias: el agente solo puede reservar un horario que le OFRECIO a esa conversacion;
antes de reservar se vuelve a mirar que siga libre; y si Google falla al crear el
evento no hay cita (la herramienta devuelve error y el agente no puede confirmar).

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
