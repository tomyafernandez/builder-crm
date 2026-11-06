# Spec: Laboratorio del agente

**Carril**: completo (tablas nuevas, rutas de API nuevas y un cambio en el contrato de encendido del agente)
**Estado**: implementada
**Fecha**: 2026-11-06
**Escrita antes del codigo**: no (escrita junto con el codigo)

## Problema

Antes de encender el agente con clientes reales no habia forma de MEDIR si atiende
bien: el simulador sirve para charlar a mano, pero no dice si el agente inventa precios,
si deriva cuando tiene que derivar o si se queda callado. El metodo de venta de Levari
(kit "Vende resultados, no herramientas") pide medir el punto de partida antes de
activar; esto lo automatiza. Idea tomada del Laboratorio de Vocero CRM (Kevin Belier,
MIT), reimplementada sobre este nucleo.

## Decisiones

- D1. **Clientes con guion fijo**, no un LLM: la prueba es repetible y dos corridas se comparan. 8 personas genericas en el nucleo (`src/lib/laboratorio/personas.ts`); un nicho las reemplaza en `config/cliente.ts` -> `laboratorio.personas` (la plantilla inmobiliaria trae 8 propias).
- D2. **Contesta el agente REAL** (mismo prompt, herramientas y modelo del canal) en conversaciones del simulador: nada sale a la red. Corre aunque el interruptor del canal este apagado (es justo para probar antes de encender).
- D3. **No ensucia el CRM**: los contactos van con source `simulador` (fuera de reportes) y etiqueta `laboratorio` (fuera de la bandeja y de las automatizaciones, asi no hay pushes al equipo). Al juzgar cada caso se copia la conversacion y el estado final a `lab_casos` y el contacto se BORRA (con su hilo y su operacion).
- D4. **Juez**: otro modelo (`AGENT_JUDGE_MODEL`, cae al del agente) lee la informacion del agente, lo esperado y la conversacion, y devuelve verde/amarillo/rojo, resumen y hallazgos tipificados (no_respondio, alucinacion, fuera_de_conocimiento, debio_derivar, tono, dato_no_guardado, fuera_de_tema) con sugerencia pregunta/respuesta. Si el agente no contesto nada, rojo sin gastar una llamada. Si el juez no devuelve un JSON valido en 2 intentos, el caso queda fuera del puntaje.
- D5. **Puntaje** 0-100: verde 1, amarillo 0,5, rojo 0. Con `laboratorio.exigir: true` no se puede encender el agente en un canal si la ultima corrida terminada de ese canal no llega a `laboratorio.puntajeMinimo` (default 85). Apagado por defecto para no trabar instancias ya desplegadas; el estandar de Levari lo enciende.
- D6. **Un paso por llamada** (una linea del guion o el juicio de un caso): ninguna peticion pasa de un turno del agente, funciona en Vercel y en Coolify, y la pantalla empuja la corrida. Corridas en curso de mas de 1 h se marcan abandonadas y se limpian.
- D7. **Sugerencias con revision humana**: "Agregar al agente" suma la pregunta y la respuesta al bloque "PREGUNTAS FRECUENTES (agregadas desde el Laboratorio)" del prompt del canal (o del global si el canal hereda). La respuesta se edita antes; si dice [COMPLETAR] se rechaza: nunca entra un dato que invento el juez.
- D8. Solo admin (o `AGENT_WORKER_SECRET` para scripts). Modulo del nucleo `laboratorio`, apagable.

## Escenarios

1. **Correr** — Admin abre /laboratorio, elige canal y pulsa Correr; ve el avance y al final el puntaje, el delta contra la corrida anterior del canal y cada cliente con su semaforo.
2. **Corregir** — Abre un caso amarillo, lee la conversacion y el hallazgo, completa la respuesta sugerida y pulsa "Agregar al agente".
3. **Encender** — Con `exigir: true`, intentar encender el agente sin corrida aprobada muestra el motivo y un acceso al Laboratorio.

## Personas para institutos y academias (listas para pegar en config/cliente.ts)

Madre o padre que pregunta por su hijo (edad y horarios) · precio, cuotas y matricula · quiere una clase de prueba ya · pregunta fuera de la informacion (beca, convenio) · pide hablar con una persona · escribe con errores y voseo · "lo voy a pensar" · hostil o compara con la competencia.

## Criterios de aceptacion

- [x] Tests puros: puntaje, interpretacion tolerante del veredicto, rojo sin respuesta, pedido al juez, personas y plantilla validas, defaults, bloque de preguntas frecuentes, regla del umbral (`tests/laboratorio.test.ts`).
- [x] Postgres 16 real + proveedor simulado: corrida completa por API (8 casos, 93/100 con 1 amarillo y 1 juez fallido fuera del puntaje), respuesta vacia reintentada, derivacion corta el guion, cero contactos de prueba restantes, cero automatizaciones, canal apagado igual se prueba, sugerencia con [COMPLETAR] rechazada y completa agregada al prompt.
- [x] Navegador (modo local): la pantalla corre, muestra el resultado, el boton queda deshabilitado con [COMPLETAR], agrega la sugerencia y la bandeja no muestra hilos del Laboratorio.
- [ ] Pendiente: una corrida con un modelo real de OpenRouter sobre la demo de Levari.

## Fuera de alcance

- Personas generadas por IA o conversaciones con LLM del lado del cliente (pierde repetibilidad).
- Correr el Laboratorio por cron o en el CI.
