# Spec: El webhook de Meta no acusa recibo si fallo

**Carril**: completo (cambia el contrato del webhook: ya no responde siempre 200)
**Estado**: implementada
**Fecha**: 2026-11-06
**Escrita antes del codigo**: no

## Problema

La ruta de Meta directo (`WHATSAPP_PROVIDER=meta`) procesaba en linea y, si guardar un
mensaje fallaba (la base parpadea, un tipo de mensaje raro), dejaba `console.error` y
respondia 200: Meta no reenviaba y el mensaje se perdia sin rastro. La ruta de Zernio ya
guarda el evento antes de procesar y lo reintenta el barrido. Idea de Vocero CRM (spec 047).

## Decisiones

- D1. Si fallo al menos un mensaje o estado, responder 500 `{retry: true}`: Meta reintenta (hasta 7 dias, con espera creciente).
- D2. La idempotencia por `meta_message_id` (ya existente) hace seguro el reintento: lo ya guardado no se duplica. Los jobs de lo que si entro se disparan igual.
- D3. Firma invalida sigue en 401 y objeto ajeno en 200 (no hay nada que reintentar).

## Criterios de aceptacion

- [x] typecheck y build.
- [ ] Pendiente de verificacion con Meta real (forzar una falla y ver el reintento).
