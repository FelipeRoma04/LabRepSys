# Manual de Usuario — LabRepSys (LAA)

> **Versión:** 1.0 · **Fecha:** 2026-11-20  
> **Aplicación:** https://feliperoma04.github.io/LabRepSys/  
> **Idioma:** Español  
> **Audiencia:** Laboratoristas, analistas, revisores y personal de recepción del laboratorio de análisis ambiental (LAA).

---

## Contenido

1. [Acceso e inicio de sesión](#1-acceso-e-inicio-de-sesión)
2. [Pantalla de inicio (Dashboard)](#2-pantalla-de-inicio-dashboard)
3. [Recepción de muestras](#3-recepción-de-muestras)
4. [Carga de resultados](#4-carga-de-resultados)
5. [Conciliación de resultados](#5-conciliación-de-resultados)
6. [Validaciones](#6-validaciones)
7. [Revisión y aprobación de reportes](#7-revisión-y-aprobación-de-reportes)
8. [Emisión del reporte](#8-emisión-del-reporte)
9. [Roles y permisos](#9-roles-y-permisos)
10. [Preguntas frecuentes](#10-preguntas-frecuentes)

---

## 1. Acceso e inicio de sesión

Abra la aplicación en su navegador:  
**https://feliperoma04.github.io/LabRepSys/**

Verá la pantalla de inicio de sesión. Ingrese su correo electrónico y contraseña asignados por el administrador del laboratorio y haga clic en **Iniciar sesión**.

> **Si olvidó su contraseña:** Use el enlace "¿Olvidó su contraseña?" en la pantalla de inicio de sesión. Recibirá un correo con un enlace para restablecerla.

> **Si su cuenta aparece inactiva:** Contacte al administrador del sistema para que active su perfil. Las cuentas nuevas se crean inactivas por defecto.

Una vez dentro, verá la barra de navegación lateral izquierda con los módulos disponibles según su rol.

---

## 2. Pantalla de inicio (Dashboard)

La pantalla de inicio muestra un resumen del estado operativo del laboratorio:

- **Muestras recibidas:** cantidad total de muestras en el sistema.
- **Muestras pendientes:** muestras que aún no tienen todos sus resultados cargados.
- **Notificaciones recientes:** avisos de reportes devueltos, aprobados o eventos que requieren su atención. Los avisos nuevos aparecen resaltados.

Desde el Dashboard puede acceder rápidamente a cualquier módulo haciendo clic en las tarjetas de resumen o usando la barra de navegación lateral.

---

## 3. Recepción de muestras

**Ruta:** Menú lateral → **Recepción**  
**Roles que pueden registrar:** RECEPCION, ADMIN

### 3.1 Registrar una muestra nueva

El formulario de recepción está dividido en pasos. Debe completar cada paso antes de avanzar al siguiente.

**Paso 1 — Código de muestra**  
Ingrese el código de la muestra según el patrón definido por el laboratorio (por ejemplo `AG2026`). El sistema valida que el código cumpla el formato y que no esté duplicado. Si el código ya existe, verá un aviso en rojo.

**Paso 2 — Cliente y cotización**  
Seleccione el cliente de la lista desplegable. Si la muestra está asociada a una cotización vigente, selecciónela también. Al seleccionar una cotización, el sistema muestra las **sugerencias de regulaciones y ensayos** asociadas. Haga clic en **Confirmar sugerencias** para aplicarlas. Este paso es obligatorio si seleccionó una cotización; no puede avanzar sin confirmar.

**Paso 3 — Datos de la muestra**  
Complete:
- **Matriz** (por ejemplo: agua superficial, suelo, aire).
- **Fecha de muestreo** y **fecha de recepción**. Si la fecha de muestreo está en el futuro o el año de muestreo no coincide con el de recepción, verá un aviso de advertencia; verifique que el dato es correcto antes de continuar.
- **Punto de muestreo** y **plan de trabajo** (opcionales).
- **Observaciones** generales.

**Paso 4 — Contenedores y conservación**  
Registre los contenedores en que llegó la muestra (tipo y cantidad) y las condiciones de conservación aplicadas.

**Paso 5 — Ensayos solicitados**  
Seleccione los ensayos que se van a realizar. Para cada ensayo indique si se realiza en el laboratorio propio (**SA**) o en un laboratorio externo subcontratado. Si selecciona "Subcontratado", debe asignar el laboratorio correspondiente en el campo que aparece.

**Paso 6 — Condiciones de llegada y desviaciones**  
- Indique las condiciones de llegada (temperatura, apariencia, etc.).
- Si la muestra llegó con alguna desviación del protocolo, active la casilla **"La muestra presenta desviaciones"**, describa la desviación en el campo que aparece, y marque **"El cliente fue consultado sobre la desviación"**. No podrá avanzar sin registrar ambos campos cuando hay desviación.

**Paso 7 — Revisión de solicitud**  
Marque las casillas de verificación:
- ✅ Capacidad del laboratorio verificada.
- ✅ Métodos disponibles verificados.
- Si el cliente solicitó declaración de conformidad, active la casilla correspondiente e ingrese la **regla de decisión acordada** con el cliente.

**Paso 8 — Resumen y guardar**  
Revise el resumen de todos los datos ingresados. Haga clic en **Guardar recepción** para registrar la muestra. El sistema la guarda con estado **RECIBIDA**.

### 3.2 Editar una recepción existente

En la lista de muestras, busque la muestra y haga clic en **Editar**. El formulario se cargará con los datos actuales. Modifique los campos necesarios y guarde.

> Los cambios en muestras quedan registrados en el historial de auditoría del sistema.

---

## 4. Carga de resultados

**Ruta:** Menú lateral → **Resultados** → **Cargar resultados**  
**Roles que pueden cargar:** ANALISTA, ADMIN

Este módulo permite ingresar los resultados de los análisis realizados. Hay tres formas de hacerlo.

### 4.1 Pegado desde tabla (Excel / portapapeles)

1. Seleccione la **muestra** de la lista desplegable.
2. Seleccione el **laboratorio** que realizó los análisis.
3. En la pestaña **Pegar tabla**, copie el contenido de las celdas de su hoja de cálculo (Excel, Calc, Google Sheets) con Ctrl+C y péguelo en el área de texto con Ctrl+V.
4. El sistema detecta automáticamente las columnas de **parámetro**, **unidad** y **resultado**. Si la detección automática no es correcta, ajuste los selectores de columna que aparecen debajo del área de texto.
5. Revise la tabla de vista previa que aparece. Puede editar celdas individualmente si hay errores de interpretación.
6. Haga clic en **Importar** para guardar los resultados. El sistema detecta si ya importó el mismo archivo previamente y le avisa para evitar duplicados.

### 4.2 Adjuntar archivo PDF del equipo

1. En la pestaña **Archivo PDF**, haga clic en **Seleccionar archivo** y elija el PDF generado por el equipo de análisis.
2. El sistema calcula un hash SHA-256 del archivo para identificarlo de forma única.
3. Ingrese los resultados manualmente en la tabla editable que aparece debajo, o espere a que el sistema cargue las filas detectadas automáticamente (si el adaptador del equipo está disponible).
4. Haga clic en **Importar**.

### 4.3 Entrada manual

1. En la pestaña **Manual**, use la tabla editable para ingresar cada resultado fila a fila.
2. Para agregar más filas, haga clic en **+ Agregar fila**.
3. Haga clic en **Importar** para guardar.

### 4.4 Confirmar filas de la importación

Después de importar, el sistema muestra las filas de la importación con el estado de cada una. Debe **confirmar** cada fila individualmente para que el resultado quede vinculado a la muestra:

1. Revise el valor, la unidad y el parámetro de cada fila.
2. Si hay un error de interpretación, edite la fila antes de confirmar.
3. Haga clic en **Confirmar** en la fila correspondiente.

Las filas confirmadas pasan a estado **confirmado** y quedan disponibles para la conciliación y el reporte.

### 4.5 Registrar una corrección

Si un resultado ya confirmado necesita corregirse:

1. En la tabla de **Resultados guardados** (parte inferior de la pantalla), haga clic en el resultado a corregir.
2. En el panel que aparece, ingrese el **nuevo valor** y el **motivo de la corrección**.
3. Haga clic en **Guardar corrección**.

La corrección queda registrada en el historial del resultado. El valor original no se elimina; el sistema muestra el valor original y la corrección con sus fechas y el usuario que la realizó.

---

## 5. Conciliación de resultados

**Ruta:** Menú lateral → **Resultados** → **Conciliación**  
**Roles que pueden resolver:** ANALISTA, ADMIN  
**Roles que pueden solicitar revisión:** ANALISTA, ADMIN, JEFE_TECNICA_CALIDAD

La conciliación compara los resultados importados con los ensayos esperados por muestra e identifica inconsistencias. El módulo muestra una lista de **inconsistencias** (issues) con su estado (Abierta / Resuelta).

### 5.1 Detectar inconsistencias

1. Haga clic en **Detectar inconsistencias** para que el sistema analice las muestras con resultados y compare contra los ensayos solicitados.
2. Las inconsistencias encontradas aparecen en la tabla. Cada fila muestra el tipo de inconsistencia, la muestra afectada y los datos en conflicto.

### 5.2 Tipos de inconsistencias frecuentes

| Tipo | Descripción |
|------|-------------|
| Resultado sin ensayo solicitado | El archivo importado tiene un parámetro que no estaba en los ensayos registrados para esa muestra. |
| Ensayo sin resultado | Se solicitó un ensayo pero no hay resultado importado para él. |
| Código de ensayo no reconocido | El parámetro del archivo no coincide con ningún ensayo del catálogo. |
| Valor fuera de rango esperado | El valor numérico supera los rangos normales del método. |

### 5.3 Resolver una inconsistencia

1. Haga clic sobre la inconsistencia en la tabla para seleccionarla.
2. En el panel de decisión que aparece a la derecha, elija la acción:
   - **Aceptar valor A:** Aceptar el dato tal como está registrado en el sistema.
   - **Aceptar valor B:** Aceptar el dato del archivo importado.
   - **Mapear ensayo:** Si el código del parámetro no fue reconocido, vincúlelo al ensayo correcto del catálogo usando el selector.
   - **Solicitar revisión:** Escala la inconsistencia al Jefe de Técnica y Calidad para que la revise.
3. Ingrese un **motivo** de la decisión (obligatorio).
4. Haga clic en **Resolver**.

La inconsistencia pasa a estado **Resuelta** y queda registrada en la auditoría del sistema con el usuario, la fecha y el motivo.

> Si hay un archivo de evidencia adjunto (PDF del equipo), puede visualizarlo haciendo clic en **Ver evidencia** dentro del panel de decisión.

---

## 6. Validaciones

**Ruta:** Menú lateral → **Validaciones**  
**Roles que pueden ejecutar:** ANALISTA, JEFE_TECNICA_CALIDAD, ADMIN

El módulo de validaciones permite ejecutar reglas de control de calidad sobre muestras o reportes y gestionar los hallazgos.

### 6.1 Ejecutar una validación

1. Seleccione el tipo de entidad a validar: **Muestra** o **Reporte**.
2. Ingrese el identificador de la entidad (ID de la muestra o del reporte).
3. Haga clic en **Ejecutar validación**.
4. El sistema corre todas las reglas activas y muestra los resultados en la tabla de hallazgos.

### 6.2 Tipos de hallazgos

| Tipo | Descripción | Acción requerida |
|------|-------------|-----------------|
| **ERROR bloqueante** | La entidad tiene un problema que impide avanzar (por ejemplo, falta la plantilla aprobada). | Corregir el dato en el módulo correspondiente y volver a ejecutar la validación. |
| **ADVERTENCIA** | Dato sospechoso pero no necesariamente incorrecto. | El analista puede resolverlo con un comentario. |
| **INFO** | Observación sin impacto en el flujo. | No requiere acción. |

### 6.3 Resolver una advertencia

1. En la tabla de hallazgos, ubique la advertencia (estado: Pendiente de decisión).
2. En el campo de texto de la columna **Decisión**, escriba el motivo por el que la advertencia es aceptable.
3. Haga clic en **Resolver**.

Los errores bloqueantes no pueden resolverse desde este módulo; deben corregirse en el origen del dato.

### 6.4 Filtrar hallazgos

Use los filtros disponibles sobre la tabla:
- **Severidad:** ERROR, WARNING, INFO, Todos.
- **Regla:** escriba parte del código de la regla.
- **Entidad:** escriba parte del ID de la muestra o reporte.
- **Estado:** Abiertos / Resueltos / Todos.

---

## 7. Revisión y aprobación de reportes

### 7.1 Crear un borrador RSA

**Ruta:** Menú lateral → **Reportes** → **Nuevo borrador RSA**  
**Rol:** ANALISTA

1. Seleccione el **cliente** al que pertenecen las muestras del reporte.
2. Seleccione el **contacto** del cliente (opcional pero recomendado para la emisión).
3. Seleccione la **plantilla aprobada** que se usará para el formato del reporte.
4. En la sección **Muestras**, marque las muestras que se incluirán. Solo se muestran muestras disponibles para el analista. Todas las muestras deben pertenecer al mismo cliente.
5. En la sección **Resultados**, marque los resultados que se incluirán (el sistema preselecciona todos los resultados de las muestras elegidas; puede desmarcar los que no correspondan).
6. Haga clic en **Guardar borrador**. El sistema crea el reporte en estado **BORRADOR** y lo abre en la pantalla de detalle.

### 7.2 Iniciar la validación del borrador

Desde la pantalla de detalle del reporte:

1. Revise el resumen del reporte (cliente, plantilla, muestras, resultados).
2. Si todo está correcto, haga clic en **Iniciar validación**.
3. El sistema ejecuta las reglas de validación del reporte:
   - Debe tener plantilla aprobada.
   - Debe tener al menos una muestra.
   - Debe tener al menos un resultado.
4. Si hay errores bloqueantes, se muestran en la sección **Hallazgos de validación**. Corríjalos antes de continuar.
5. Cuando no hay errores bloqueantes, haga clic en **Validar y enviar a revisión**. El reporte pasa a estado **LISTO PARA REVISIÓN**.

### 7.3 Revisión por el Jefe de Técnica y Calidad

**Rol:** JEFE_TECNICA_CALIDAD

1. En el Menú lateral → **Reportes** → **En revisión**, verá los reportes en estado LISTO PARA REVISIÓN.
2. Haga clic en un reporte para abrir su detalle.
3. Revise:
   - Los datos del cliente y la plantilla.
   - Las muestras incluidas (código, matriz, fecha de muestreo).
   - Los resultados (ensayo, método, unidad, valor, incertidumbre).
   - La normativa y los límites aplicables.
   - Los hallazgos de validación pendientes.
4. Haga clic en **Iniciar revisión**. El reporte pasa a estado **EN REVISIÓN**.

**Si el reporte está correcto:**
- Haga clic en **Aprobar**. El reporte pasa a estado **APROBADO**.

**Si el reporte necesita correcciones:**
- Escriba un comentario de revisión explicando qué debe corregir el analista.
- Haga clic en **Devolver con comentario**. El reporte pasa a estado **DEVUELTO**.

> El botón **Devolver** solo está disponible si hay un comentario escrito. No se puede devolver un reporte sin indicar el motivo.

### 7.4 Corregir un reporte devuelto

**Rol:** ANALISTA (el mismo que preparó el reporte)

1. En Menú lateral → **Reportes** → **Borradores**, verá el reporte con estado DEVUELTO.
2. Abra el reporte y revise el comentario de revisión en la sección **Historial de estados** o **Comentarios**.
3. Haga clic en **Editar borrador** para modificar las muestras, resultados o plantilla.
4. Una vez corregido, guarde y regrese al detalle del reporte.
5. Haga clic en **Reenviar a revisión**. El reporte vuelve a estado **LISTO PARA REVISIÓN**.

### 7.5 Agregar comentarios durante la revisión

Tanto el analista como el revisor pueden agregar comentarios al reporte mientras está en estado editable o en revisión:

1. En la sección **Comentarios** al final del detalle del reporte, seleccione a qué se refiere el comentario: **Reporte**, **Resultado** o **Campo**.
2. Si eligió **Resultado**, seleccione el resultado específico de la lista.
3. Escriba el comentario y haga clic en **Agregar comentario**.

Los comentarios quedan visibles para todos los usuarios que pueden ver el reporte y no se pueden eliminar (son parte del historial de auditoría).

---

## 8. Emisión del reporte

**Ruta:** Menú lateral → **Reportes** → **Aprobados**  
**Rol:** JEFE_TECNICA_CALIDAD (y no puede ser la misma persona que preparó el reporte)

La emisión es la acción final que convierte el reporte aprobado en un documento oficial e inmutable.

### 8.1 Emitir un reporte

1. En la lista de reportes aprobados, ubique el reporte a emitir.
2. Haga clic en **Emitir**. El sistema verifica:
   - Que el reporte tiene estado APROBADO.
   - Que tiene cliente, plantilla aprobada, muestras, resultados y al menos una aprobación registrada.
   - Que la persona que emite **no es la misma que preparó el reporte** (segregación de funciones obligatoria).
3. Si todas las verificaciones son correctas, el sistema:
   - Asigna un **código oficial** al reporte (formato consecutivo del laboratorio).
   - Genera un **snapshot inmutable** con todos los datos del reporte en el momento de la emisión (muestras, resultados, normativa, plantilla).
   - Calcula un hash SHA-256 del snapshot para garantizar integridad.
   - Registra la emisión en la auditoría del sistema.
   - Cambia el estado del reporte a **EMITIDO**.
4. El reporte emitido aparece en Menú lateral → **Reportes** → **Emitidos**.

> Si la misma persona que preparó el reporte intenta emitirlo, el sistema lo bloquea con el mensaje "Segregación de funciones: el emisor no puede ser el mismo que preparó el reporte."

### 8.2 Rectificar un reporte emitido

Si un reporte ya emitido contiene un error que debe corregirse:

1. En la lista de reportes emitidos, haga clic en **Rectificar** en el reporte correspondiente.
2. Se abre un cuadro de diálogo. Escriba el **motivo de la rectificación** (obligatorio).
3. Haga clic en **Confirmar rectificación**.
4. El sistema crea una nueva versión del reporte (versión 2, 3, etc.) con estado **BORRADOR**, vinculada al reporte original.
5. El reporte original queda con estado **RECTIFICADO** y el vínculo al nuevo borrador queda registrado.
6. El nuevo borrador pasa por el flujo completo nuevamente: preparación → validación → revisión → aprobación → emisión.

### 8.3 Anular un reporte emitido

Si el reporte emitido es completamente inválido y no procede rectificación:

1. En la lista de reportes emitidos, haga clic en **Anular**.
2. Confirme la acción. El estado del reporte cambia a **ANULADO**.
3. Los reportes anulados quedan visibles en el historial pero no pueden reabrirse.

---

## 9. Roles y permisos

| Rol | Nombre completo | Acciones principales |
|-----|----------------|---------------------|
| **ADMIN** | Administrador | Acceso completo. Gestiona usuarios, catálogos, configuración del sistema. |
| **RECEPCION** | Personal de recepción | Registra y edita muestras. Adjunta archivos a muestras. |
| **MUESTREO** | Personal de campo | Registra datos de campo y mediciones en sitio. |
| **COMERCIAL** | Área comercial | Gestiona clientes, contactos y cotizaciones. |
| **ANALISTA** | Analista de laboratorio | Carga resultados, crea y edita borradores de reportes, ejecuta validaciones. |
| **JEFE_TECNICA_CALIDAD** | Jefe de Técnica y Calidad | Revisa, aprueba y emite reportes. Aprueba plantillas. Importa regulaciones. |
| **AUDITOR** | Auditor interno / externo | Solo lectura. Ve muestras, resultados, reportes y registros de auditoría. |

> Un usuario puede tener más de un rol. Los roles se asignan desde el módulo **Administración** (solo ADMIN).

---

## 10. Preguntas frecuentes

**¿Por qué no puedo avanzar al siguiente paso en la recepción?**  
El sistema valida cada paso antes de avanzar. Revise el mensaje de error en rojo que aparece sobre el botón "Siguiente". Los requisitos más comunes son: código de muestra con el formato correcto, cliente seleccionado, y al menos un ensayo marcado.

**¿Por qué no veo el botón "Iniciar revisión"?**  
Este botón solo aparece para usuarios con rol JEFE_TECNICA_CALIDAD cuando el reporte está en estado LISTO PARA REVISIÓN. Si su rol es ANALISTA, verá el botón "Validar y enviar a revisión" cuando el reporte está en BORRADOR.

**¿Por qué no puedo emitir el reporte que yo mismo preparé?**  
La norma ISO 17025 exige segregación de funciones: quien prepara el reporte no puede ser quien lo emita. Solicite al Jefe de Técnica y Calidad que lo emita.

**¿Puedo editar una muestra después de que ya tiene resultados cargados?**  
Sí, puede editar los datos generales de la muestra. Los resultados ya confirmados tienen su propio mecanismo de corrección (módulo Resultados → campo "Registrar corrección"). Los cambios quedan en el historial de auditoría.

**¿Dónde veo los reportes emitidos anteriores?**  
En Menú lateral → **Reportes** → **Emitidos**. Desde allí puede consultar el detalle de cada reporte, incluyendo el snapshot con los datos exactos en el momento de la emisión.

**La aplicación muestra "Configuración no encontrada". ¿Qué significa?**  
La aplicación no puede conectarse al servidor de base de datos. Contacte al administrador del sistema para verificar la configuración de las variables de entorno de la aplicación.

**¿Cómo sé si mi sesión sigue activa?**  
La sesión se renueva automáticamente mientras usa la aplicación. Si la aplicación muestra la pantalla de inicio de sesión, su sesión expiró; ingrese nuevamente con sus credenciales.

**¿Puedo usar la aplicación desde el teléfono?**  
La aplicación está diseñada para escritorio. Funciona en navegadores móviles modernos pero la experiencia es óptima en pantallas de 1024 px de ancho o más.

---

> **Soporte técnico:** Contacte al administrador del sistema para problemas de acceso, configuración o errores técnicos. Para problemas con resultados o interpretación de datos, consulte con el Jefe de Técnica y Calidad.
