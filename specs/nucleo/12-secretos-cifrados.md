# Spec: Secretos cifrados en reposo

**Carril**: completo (cambia como se guarda un dato y agrega una variable)
**Estado**: implementada
**Fecha**: 2026-11-06
**Escrita antes del codigo**: no (escrita junto con el codigo; es documentacion)

## Problema

`whatsapp_accounts.access_token` se guardaba en texto plano ("Fase 1"). Es el token del
WhatsApp del cliente: quien tenga un backup de la base o lea una consulta en un log puede
mandar mensajes con su numero. Idea tomada de Vocero CRM (Kevin Belier, MIT), principio I
de su constitucion.

## Decisiones

- D1. AES-256-GCM, iv aleatorio por valor, en la MISMA columna con prefijo
  `enc:v1:<iv>:<tag>:<cifrado>` (base64). Sin migracion de esquema.
- D2. Clave en `ENCRYPTION_KEY` (32 bytes en base64). Opcional para no cortar instancias
  viejas; `/api/health` responde `cifrado: true|false` y una clave mal formada da 503.
- D3. Una sola implementacion (`scripts/lib/cifrado.mjs`) para la app, el runner de
  migraciones y `connect:whatsapp`; `src/lib/cifrado.ts` la reexporta con tipos.
- D4. El texto plano heredado se sigue leyendo (con aviso en el log) y el runner de
  migraciones lo cifra al arrancar si hay clave. Idempotente.
- D5. Cifrar sin clave LANZA: nunca se guarda un secreto en claro "por las dudas".

## Escenarios

1. **Conectar** — `npm run connect:whatsapp` sin `ENCRYPTION_KEY` se niega; con clave guarda `enc:v1:...`.
2. **Actualizar una instancia vieja** — se carga la clave, se redespliega y el log dice "N token(s) de WhatsApp cifrados en reposo".
3. **Clave equivocada** — el envio falla con "ENCRYPTION_KEY no es la misma con la que se cifro", no manda basura a Meta.

## Criterios de aceptacion

- [x] Tests: ida y vuelta, iv distinto, manipulacion detectada, otra clave falla, sin clave no cifra, texto plano heredado, app y runner compatibles, validacion de la clave (`tests/secretos-cifrados.test.ts`).
- [x] Postgres 16 real: el runner cifra el token heredado, la segunda corrida no toca nada y el valor se descifra igual.
- [x] `/api/health` con clave valida: `cifrado: true`; con clave invalida: 503 `faltan: ["ENCRYPTION_KEY"]`.

## Fuera de alcance

- Rotacion de clave (cambiarla deja ilegible lo cifrado): pendiente, con un script que recifre.
- Las claves de Zernio, OpenRouter y S3 viven en variables de la plataforma, no en la base.
