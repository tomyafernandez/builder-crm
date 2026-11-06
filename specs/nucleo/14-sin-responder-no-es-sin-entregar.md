# Spec: Sin responder no es sin entregar

**Carril**: completo (cambia el contrato interno de la cola del agente y lo que se guarda en `raw_payload`)
**Estado**: implementada
**Fecha**: 2026-11-06
**Escrita antes del codigo**: no

## Problema

El cliente escribe "hola"; el agente tarda 10 a 40 s. En ese rato el cliente manda
"¿hacen envios?". Dos fallas:

1. Como el job del primero ya estaba `processing`, el segundo creaba otro job que podia
   correr EN PARALELO: dos respuestas cruzadas al mismo mensaje.
2. Si la respuesta al primero se guardaba antes de que corriera el segundo job, el
   historial (ordenado por hora de guardado) terminaba en un saliente y el job concluia
   `already_replied`: el segundo mensaje no se contestaba nunca. Vocero CRM lo midio en
   el 1,7 % de los turnos (su spec 025).

## Decisiones

- D1. Un solo turno del agente por conversacion: si hay otro job `processing` vivo (< 120 s) del mismo hilo, el nuevo queda `pending` (`conversation_busy`) con el debounce renovado.
- D2. Al terminar un turno (bien o mal), el worker libera los pendientes del hilo y los dispara en `after()`: se contestan en segundos, no a los 30 min del barrido.
- D3. Cada respuesta del agente guarda `raw_payload.agente.leidoHasta` (el entrante mas nuevo que leyo). El historial ordena esa respuesta en ese momento: solo salda lo que el agente leyo. Una respuesta de una PERSONA salda todo lo anterior. Filas viejas sin anotacion se comportan como antes.

## Criterios de aceptacion

- [x] Tests puros del historial: el caso de la carrera queda debido, leidos los dos queda contestado, la persona salda, compatibilidad (`tests/agente-no-calla.test.ts`).
- [x] Postgres real: job2 da `conversation_busy` mientras job1 corre; al terminar job1 se libera; el historial de job2 termina en "¿hacen envios?".
- [ ] Pendiente de verificacion en vivo con Zernio y un numero de prueba.
