# Spec: El agente no se queda callado y responde en un mensaje

**Carril**: ligero (prompt y loop del agente; sin datos ni contratos)
**Estado**: implementada
**Fecha**: 2026-11-06
**Escrita antes del codigo**: no

## Problema

- Vocero CRM midio que ante "Hola prueba 1" el modelo no respondia 8 de 8 veces (decidia que no iba en serio). Es lo primero que escribe el dueno al probar y lo que escribe un cliente para ver si alguien atiende. En Builder una respuesta vacia terminaba en `empty_reply` y el cliente no recibia nada.
- Desde el 01/10/2026 Meta cobra cada mensaje de servicio entregado: partir una respuesta en varios mensajes multiplica el costo y se lee como un bot.

## Decisiones

- D1. `REGLAS_NUCLEO` se agrega SIEMPRE al final del prompt (aunque `config/cliente.ts` o Ajustes lo reemplacen entero): responder siempre (callar solo ante un cierre despues de haber respondido) y un solo mensaje por turno.
- D2. Si el modelo devuelve vacio, se le recuerda la regla UNA vez; si insiste, `empty_reply` como antes (no se inventa un texto desde el codigo).

## Criterios de aceptacion

- [x] Test: las reglas aparecen con un prompt propio del cliente.
- [ ] Pendiente: medirlo con el Laboratorio (proxima etapa) sobre "Hola, prueba".
