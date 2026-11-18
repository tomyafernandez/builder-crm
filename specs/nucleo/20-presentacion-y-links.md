# 20 · Links con texto, contactos sin nombre y modo presentación

Carril ligero: UI, un campo de config y un formato de mensaje. Sin migraciones.

## Problema

Grabando una demo salían cosas que un cliente no tiene por qué ver:

- El link de pago de la seña aparecía como una URL larga en el chat.
- Los contactos del simulador se llamaban "Cliente simulado 1e69", la bandeja marcaba "sim" en cada fila y el encabezado mostraba `sim:uuid`.
- Debajo del simulador, una línea de diagnóstico ("Último turno · 2 herramientas").
- La flecha de "nuevos en 7 días" bajaba sola según la hora: el día de hoy, a medias, contaba como un día entero.
- Pantallas sin tildes.

## Decisiones

- D1. **Links con texto.** Un mensaje puede llevar `[texto](url)`. La bandeja y el simulador lo muestran como un link corto y clickeable (`TextoConEnlaces`); una URL suelta se muestra acortada. `src/lib/enlaces.ts` es puro.
- D2. **Lo decide la tool, no el modelo.** Una tool puede devolver `data.enlaces: [{ url, texto }]`. Al final del turno, el agente reemplaza cada una de esas URL que el modelo pegó suelta por `[texto](url)` (`aplicarEnlaces`). La agenda lo usa para el pago: "Pagá tu seña acá".
- D3. **Un canal real recibe texto plano.** WhatsApp, Instagram y Messenger no entienden markdown: `deliverMessage` convierte `[texto](url)` en `texto: url` antes de llamar al conector (salvo el simulador). El hilo guarda la versión con texto.
- D4. **Contacto sin nombre.** El simulador crea el contacto con un teléfono de prueba (`+54 9 11 5xxx-xxxx`) como nombre y como teléfono, sin etiqueta. El marcador de simulación sigue siendo `source = 'simulador'`. El encabezado de un hilo del simulador muestra ese teléfono, no `sim:uuid`. Cuando el nombre no tiene letras, el CONTEXTO del agente dice que todavía no lo sabe y que lo pregunte y lo guarde; el recordatorio de la agenda no saluda por el número.
- D5. **Modo presentación** (`presentacion: true` en `config/cliente.ts`, por defecto apagado): esconde la etiqueta "sim" de la bandeja y la línea de diagnóstico del simulador. No cambia ningún comportamiento. El Laboratorio se oculta con `modulos.nucleo.laboratorio: false`, que ya existía.
- D6. **Nuevos en 7 días** compara los últimos 7×24 h contra los 7×24 h anteriores. La serie del gráfico sigue siendo por día.
- D7. Tildes en el texto visible de Simulador, Panel, Agenda, Seguimientos, Bandeja y ficha del contacto. Las claves y los identificadores no se tocan.

## Criterios de aceptación

- [x] `tests/enlaces.test.ts`: URL suelta → link con texto, sin tocar la que ya lo tiene; conversión a texto para un canal real; partición en tramos.
- [x] `tests/agenda-sena.test.ts`: el recordatorio no saluda por el teléfono.
- [x] En la demo publicada: el link de pago se ve como "Pagá tu seña acá" y abre la página de pago.

## Fuera de alcance

- Vista previa de links (tarjeta con imagen) en la bandeja.
