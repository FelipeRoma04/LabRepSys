# A06 - Accesibilidad y responsive (WCAG 2.1 AA)

Prerrequisito: despues de p05; repetir al terminar p14.
Rama: feature/a06-accesibilidad
Puede tocar: componentes compartidos (src/components, layouts), estilos, pruebas de accesibilidad.
No tocar: logica de negocio, servicios, migraciones.

OBJETIVO
Cumplir la meta RNF-013 y RNF-012: uso con teclado, lectores de pantalla, computador, tablet y celular (campo).

REQUISITOS
- Auditar con axe-core (via @axe-core/playwright o jest-axe) todas las rutas; clasificar hallazgos.
- Corregir primero en componentes compartidos: foco visible, orden de tabulacion, etiquetas de formularios, roles ARIA en modales y tablas, mensajes de error asociados al campo, contraste minimo, no depender solo del color en estados (usar texto o icono).
- Modales con trampa de foco y cierre con Escape. Tablas con encabezados correctos; resultados con operador "<" legibles por lector de pantalla.
- Responsive: probar 390 px (celular), 768 px (tablet) y escritorio; formulario de datos de campo sin desplazamiento horizontal; objetivos tactiles de al menos 44 px.
- No cambiar el diseño visual salvo lo necesario para contraste y foco.

ACEPTACION
- Informe docs/ACCESIBILIDAD.md: hallazgos, corregidos y pendientes por ruta.
- Cero violaciones criticas o serias de axe en las rutas principales.
- Prueba automatizada que falle si reaparecen.
