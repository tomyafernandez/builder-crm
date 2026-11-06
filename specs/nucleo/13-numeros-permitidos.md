# Spec: Numeros permitidos (modo pruebas en vivo)

**Carril**: ligero (variable nueva, sin datos ni contratos)
**Estado**: implementada
**Fecha**: 2026-11-06
**Escrita antes del codigo**: no

## Problema

Para probar el agente con el numero REAL de un cliente (antes de abrirlo al publico) no
habia forma de garantizar que no le escribiera a sus clientes: el agente, una
automatizacion o un reintento pueden salir hacia cualquiera. Tomado de Vocero CRM
(`ALLOWED_WA_IDS`, specs 032 y principio IX).

## Decisiones

- D1. `ALLOWED_WA_IDS`: numeros (con o sin +, normalizados como el resto del CRM) e ids de canal con prefijo (`ig:`, `fb:`, `tt:`), separados por coma. Vacia = sin restriccion.
- D2. Se chequea en las DOS unicas puertas de salida: `deliverMessage` (agente, bandeja, plantillas en hilo abierto, automatizaciones, derivacion) y el primer contacto por plantilla de `/api/whatsapp/send`. Ningun camino nuevo puede saltearlo sin pasar por ahi.
- D3. Bloqueado = no se crea fila en el hilo, error `fuera_de_lista_permitida` con motivo legible. El simulador no se filtra (nunca sale a la red).
- D4. `/api/health` dice `soloNumerosPermitidos: true` para que nadie olvide la instancia en modo pruebas.

## Criterios de aceptacion

- [x] Tests de normalizacion, lista vacia, destino desconocido, Instagram/Messenger (`tests/numeros-permitidos.test.ts`).
- [x] Postgres real: un envio del agente a un numero fuera de la lista no sale ni deja fila.
