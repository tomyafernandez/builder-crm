# Spec: Seguimiento automatico

**Carril**: completo (cambia el contrato de configuracion y agrega un barrido que escribe a clientes)
**Estado**: implementada
**Fecha**: 2026-11-10
**Escrita antes del codigo**: no (escrita junto con el codigo)

## Problema

La duena de un centro de estetica lo conto asi: hace los seguimientos "chat por chat" los
viernes y sabados, sabe que hacen falta 4 o 5 contactos para que alguien compre y no
llega; las consultas que pago en publicidad "quedan en la nada". El seguimiento es lo que
mas plata recupera, y por eso la base del retorno de la inversion.

## Decisiones

- D1. Las horas de cada paso se cuentan desde el ULTIMO MENSAJE DEL CLIENTE (`conversations.last_inbound_at`). Si el cliente vuelve a escribir, la cuenta vuelve a empezar.
- D2. Dentro de las 24 h: texto libre redactado por el agente del canal con la conversacion (retoma lo que pregunto, termina con una pregunta, sin presionar). Fuera de las 24 h: en WhatsApp solo con la plantilla aprobada del paso; Instagram y Messenger no.
- D3. No se escribe: si lo ultimo es del cliente (le toca al agente), si la conversacion esta derivada o el agente pausado, si la etapa es ganada, perdida o esta en `etapasSinSeguimiento`, a contactos del Laboratorio, fuera del horario configurado (zona de la instancia), ni a menos de 30 min de otro mensaje nuestro.
- D4. Sale por `deliverMessage`: respeta ALLOWED_WA_IDS y el conector. Cada envio queda marcado en `raw_payload.seguimiento.paso`.
- D5. Barrido `GET /api/seguimientos/process` (secreto del worker), en `src/lib/barridos.ts` (Coolify) y en el cron de Vercel / GitHub Actions. Hasta 10 envios por corrida.
- D6. Apagado por defecto (`seguimiento.activo: false`): escribe a clientes reales y se enciende a proposito.
- D7. Medicion para el retorno: una conversacion se "recupera" si el cliente vuelve a escribir despues de un seguimiento. Pagina Seguimientos (admin) con enviados, recuperadas, ultimos y esperando, y un boton "Probar en el simulador" que solo toca conversaciones del simulador y no espera las horas. Desde 2.6.0 (spec nucleo/19, D5) solo las de contactos creados desde /simulador: los datos demo quedan afuera.

## Criterios de aceptacion

- [x] Tests puros de cada regla (plazo, conteo de pasos, reinicio al responder, agotados, ventana y plantilla, Instagram, horario, derivacion, pausa, etapas, laboratorio, apagado, prueba) y de la medicion (`tests/seguimiento.test.ts`).
- [x] Modo local con proveedor de IA simulado: una corrida real no envia antes del plazo; la prueba envia el paso 1 y el 2 y despues no mas; al responder el cliente, el panel cuenta 1 recuperada; el barrido sin secreto da 401.
- [ ] Pendiente: probarlo con un modelo real y con el numero oficial conectado.

## Fuera de alcance

- Plantillas por paso con variables (nombre, servicio).
- Recordatorios de citas (va con la agenda).
