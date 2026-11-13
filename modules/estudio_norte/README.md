# Modulo `estudio_norte` — datos de la demo (solo rama `demo`)

No tiene menu ni tablas. Su `seed` (lo corre `npm run seed` o el boton "Cargar demo"):

1. Configura la agenda: lunes a sabado de 9 a 19, turnos de 60 min, tres servicios
   (Primera consulta USD 40, Sesion individual USD 80, Plan mensual USD 280), sena del 30%
   con 1 hora para pagarla y recordatorio 24 h antes.
2. Una sola vez, siembra 30 dias de actividad inventada (`lib/generar.ts`): ~60 consultas
   por dia, conversaciones con el agente, seguimientos y recuperadas, derivaciones,
   operaciones en el pipeline y turnos en todos los estados. Todo con la etiqueta `demo`.
   Es DETERMINISTICO: misma semilla y fechas relativas a hoy, asi que la tarjeta del panel
   da siempre USD 2.299 en 30 dias (como el caso de la web). Lo fija `tests/estudio-norte.test.ts`.

**Antes de grabar o de una demo:** abrir `/m/estudio_norte` y tocar **Recargar datos**. La
tarjeta mira los ultimos 30 dias y, con los dias, lo sembrado se va saliendo de la ventana.
Recargar borra lo sembrado (no lo creado en el Simulador) y lo vuelve a crear terminando hoy.
Los parametros de la mezcla estan en `PARAMETROS` (`lib/generar.ts`).

Nunca se activa en una instancia real. Importa sus propias definiciones de las tablas de
la agenda (`lib/tablas.ts`) porque un modulo no importa otro.
