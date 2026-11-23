# Borrador — Política de Tratamiento de Datos Personales y Lista de Requisitos ISO 17025

> **Estado:** BORRADOR para revisión por área jurídica y de calidad.  
> **Fecha:** 2026-11-20  
> **Elaborado por:** Kiro (revisión técnica del sistema). No sustituye asesoría jurídica ni certificación de calidad.  
> **Aplica a:** LabRepSys — sistema de gestión de reportes del laboratorio de análisis ambiental (LAA).

---

## Parte I — Política de Tratamiento de Datos Personales (Habeas Data)

> **AVISO LEGAL:** Este borrador sigue los principios de la Ley 1581 de 2012 (Colombia) y el Decreto 1377 de 2013. Debe ser revisado y aprobado por el área jurídica del laboratorio antes de su publicación. Las referencias normativas deben verificarse contra la versión vigente de la ley en el momento de la adopción.

---

### 1. Identificación del Responsable del Tratamiento

| Campo | Dato |
|-------|------|
| **Razón social** | [Nombre del laboratorio — completar] |
| **NIT** | [NIT del laboratorio — completar] |
| **Dirección** | [Dirección del laboratorio — completar] |
| **Correo electrónico de contacto** | [Correo de contacto de datos personales — completar] |
| **Responsable designado** | [Nombre del responsable de protección de datos — completar] |
| **Sistema al que aplica** | LabRepSys (https://feliperoma04.github.io/LabRepSys/) |

---

### 2. Datos personales que trata el sistema

El sistema LabRepSys trata los siguientes datos personales, identificados mediante revisión técnica del código y la base de datos:

#### 2.1 Datos de usuarios internos (personal del laboratorio)

| Dato | Tabla en la base de datos | Finalidad |
|------|--------------------------|-----------|
| Nombre completo | `public.profiles.full_name` | Identificación del usuario en el sistema |
| Correo electrónico | `public.profiles.email` | Autenticación, notificaciones del sistema |
| Cargo | `public.profiles.job_title` | Identificación del rol operativo en el reporte |
| Estado (activo/inactivo) | `public.profiles.active` | Control de acceso al sistema |
| Identificador único (UUID) | `public.profiles.id` | Llave primaria de relación con todas las operaciones |
| Roles asignados | `public.user_roles.role_code` | Control de permisos y segregación de funciones |
| Referencia de firma | `sample_receptions.signature_reference` | Firma en el registro de recepción |
| Referencia de firma | `report_approvals.signature_reference` | Firma en el proceso de aprobación de reportes |

#### 2.2 Datos de clientes y contactos

| Dato | Tabla | Finalidad |
|------|-------|-----------|
| Razón social / nombre del cliente | `public.clients.business_name` | Identificación del cliente en cotizaciones, muestras y reportes |
| NIT o documento de identificación | `public.clients.tax_id` *(verificar nombre exacto de columna)* | Identificación fiscal |
| Dirección | `public.clients` | Datos de contacto comercial |
| Nombre del contacto | `public.contacts` | Gestión de comunicaciones con el cliente |
| Correo electrónico del contacto | `public.contacts` | Comunicaciones sobre muestras y reportes |
| Teléfono del contacto | `public.contacts` | Comunicaciones operativas |

#### 2.3 Datos derivados del servicio analítico

| Dato | Tabla | Finalidad |
|------|-------|-----------|
| Resultados de análisis asociados a muestras del cliente | `public.results` | Prestación del servicio analítico |
| Reportes de ensayo firmados y emitidos | `public.reports`, `public.report_snapshots` | Documento técnico oficial del servicio |
| Fecha y punto de muestreo | `public.samples` | Trazabilidad del servicio |
| Archivos adjuntos a muestras | `storage: source-files` | Evidencia técnica del análisis |
| Registros de auditoría con ID de usuario | `public.audit_logs` | Trazabilidad y control interno |

#### 2.4 Datos NO tratados por el sistema

- Datos biométricos de clientes.
- Datos de salud de personas naturales.
- Datos de menores de edad.
- Información financiera de clientes (el sistema no procesa pagos).

---

### 3. Finalidades del tratamiento

El laboratorio trata los datos personales descritos con las siguientes finalidades:

1. **Gestión del servicio analítico:** registrar la recepción de muestras, procesar resultados y emitir reportes de ensayo.
2. **Comunicaciones del servicio:** notificar al cliente sobre el estado de sus muestras y reportes.
3. **Control de acceso y seguridad:** autenticar usuarios del sistema y controlar sus permisos según el rol.
4. **Trazabilidad y auditoría interna:** registrar las acciones realizadas sobre datos para garantizar la integridad del sistema y cumplir con requisitos de acreditación (ISO/IEC 17025).
5. **Cumplimiento legal y regulatorio:** conservar registros requeridos por la normativa ambiental aplicable y por el organismo de acreditación.
6. **Respaldo y recuperación ante desastres:** garantizar la disponibilidad del servicio y la integridad de los datos.

---

### 4. Base legal del tratamiento

| Categoría de datos | Base legal |
|-------------------|-----------|
| Datos de usuarios internos | Contrato laboral / relación contractual con el laboratorio |
| Datos de clientes y contactos | Ejecución del contrato de prestación de servicios analíticos y consentimiento |
| Datos derivados del servicio | Ejecución del contrato de prestación de servicios analíticos |
| Registros de auditoría | Obligación legal (ISO 17025, normativa ambiental) y consentimiento |

---

### 5. Derechos de los titulares

De conformidad con la Ley 1581 de 2012, los titulares de los datos personales tienen los siguientes derechos:

- **Conocer:** acceder a los datos personales que el laboratorio trate sobre ellos.
- **Actualizar y rectificar:** corregir datos inexactos, incompletos o fraccionados.
- **Suprimir:** solicitar la eliminación de sus datos cuando no exista obligación legal de conservarlos.
- **Revocar la autorización:** retirar el consentimiento otorgado para el tratamiento.
- **Presentar quejas:** ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.

**Canal de atención para ejercer derechos:**  
[Correo electrónico designado — completar] | [Teléfono o formulario de contacto — completar]  
Tiempo de respuesta: máximo 10 días hábiles para consultas; 15 días hábiles para reclamos.

---

### 6. Transferencia y transmisión de datos

| Destinatario | Tipo | Propósito | Base legal |
|-------------|------|-----------|-----------|
| Supabase (proveedor de base de datos en la nube) | Encargado del tratamiento | Almacenamiento y procesamiento técnico de los datos | Contrato de encargo de tratamiento con Supabase |
| Laboratorios externos subcontratados | Tercero receptor | Recibir muestras y reportar resultados al LAA | Ejecución del contrato de prestación de servicios |
| Organismos regulatorios y de acreditación | Autoridad | Reporte de resultados exigido por ley | Obligación legal |

> **Nota para el área jurídica:** verificar si Supabase (Supabase Inc., EE.UU.) implica transferencia internacional de datos según la Ley 1581. De ser así, se debe suscribir una cláusula contractual estándar o verificar que Supabase cuenta con certificación de protección adecuada.

---

### 7. Medidas de seguridad implementadas

El sistema implementa las siguientes medidas técnicas y organizativas, verificadas mediante revisión del código fuente:

| Medida | Implementación técnica |
|--------|----------------------|
| Control de acceso por roles | RLS (Row Level Security) en PostgreSQL + roles ADMIN, ANALISTA, JTC, RECEPCION, MUESTREO, COMERCIAL, AUDITOR |
| Autenticación | Supabase Auth con JWT; sesión con renovación automática |
| Cifrado en tránsito | HTTPS obligatorio (GitHub Pages + Supabase) |
| Cifrado en reposo | Gestionado por Supabase (infraestructura en la nube) |
| Acceso a archivos | Solo mediante URLs firmadas de 60 segundos; archivos en buckets privados |
| Registro de auditoría | Tabla `audit_logs` con todas las acciones sobre datos sensibles |
| Segregación de funciones | El analista que prepara un reporte no puede emitirlo |
| Inmutabilidad de reportes emitidos | Snapshot con hash SHA-256 en el momento de la emisión |
| Sin claves en código fuente | La `service_role` solo existe en variables de entorno del servidor |

#### Medidas pendientes de implementar (recomendadas)

- [ ] Autenticación multifactor (MFA) para todos los usuarios con acceso a datos sensibles.
- [ ] Política formal de contraseñas (longitud mínima, rotación periódica).
- [ ] Procedimiento documentado de eliminación segura de datos al finalizar relaciones contractuales.
- [ ] Registro formal de encargados del tratamiento (actualización del Registro Nacional de Bases de Datos ante la SIC).
- [ ] Capacitación anual al personal del laboratorio sobre protección de datos.

---

### 8. Tiempo de conservación de los datos

| Categoría | Tiempo de conservación | Base |
|-----------|----------------------|------|
| Reportes de ensayo emitidos | Mínimo 10 años (o según exija la norma del cliente / regulación) | ISO 17025 §8.4.1; normativa ambiental aplicable |
| Resultados de análisis | Mínimo 10 años | ISO 17025 §8.4 |
| Registros de auditoría del sistema | 5 años | Recomendación práctica; ajustar según regulación |
| Datos de usuarios inactivos | Hasta 2 años después de la inactivación | Recomendación práctica |
| Datos de clientes sin relación activa | Hasta 5 años después del último servicio prestado | Recomendación práctica |

> **Decisión pendiente (DP-016):** El RPO/RTO del sistema y la política de retención de respaldos deben alinearse con los tiempos de conservación aquí indicados.

---

### 9. Vigencia de la política

Esta política entra en vigencia a partir de su aprobación por la dirección del laboratorio y permanece vigente hasta su actualización. Será revisada anualmente o cuando ocurran cambios significativos en el tratamiento de datos o en la normativa aplicable.

---

## Parte II — Lista de Requisitos ISO/IEC 17025:2017 para el Informe de Ensayo

> **AVISO:** Este listado es un borrador técnico elaborado con base en la revisión del sistema y en los requisitos publicados de ISO/IEC 17025:2017. Debe ser verificado y complementado por el área de calidad del laboratorio contra la versión oficial de la norma y el alcance específico de la acreditación.

---

### Cláusula 7.8 — Informe de resultados (requisitos del reporte de ensayo)

La cláusula 7.8 de ISO 17025:2017 establece los contenidos mínimos que debe tener un informe de ensayo. A continuación se indica el estado de cada requisito en el sistema LabRepSys.

#### 7.8.2 — Requisitos comunes de los informes

| Requisito | Referencia norma | Estado en LabRepSys | Observación |
|-----------|-----------------|-------------------|-------------|
| Título (por ejemplo "Informe de ensayo") | 7.8.2 a) | ⚠️ Pendiente | Definir el título oficial en la plantilla. Requiere decisión sobre el diseño oficial del informe (DP-012). |
| Nombre y dirección del laboratorio | 7.8.2 b) | ⚠️ Pendiente | Incluir en la plantilla aprobada. |
| Lugar donde se realizaron los ensayos (si diferente a la dirección del laboratorio) | 7.8.2 b) | ⚠️ Pendiente | Aplica cuando los ensayos se realizan en campo. |
| Identificación única del informe (número de informe u otro identificador) | 7.8.2 c) | ✅ Implementado | Código consecutivo asignado en la emisión mediante `next_counter()`. |
| Número de página y total de páginas | 7.8.2 c) | ⚠️ Pendiente | Implementar en la generación del PDF. |
| Nombre y datos de contacto del cliente | 7.8.2 d) | ✅ Implementado | `clients.business_name`, `contacts`. Incluido en el snapshot. |
| Identificación del método utilizado | 7.8.2 e) | ✅ Implementado | `results.method_text`, `results.technique_text`. |
| Descripción, estado e identificación de los ítems de ensayo | 7.8.2 f) | ✅ Implementado | Código de muestra, matriz, punto de muestreo, fecha de muestreo y recepción, observaciones. |
| Fecha de recepción del ítem de ensayo | 7.8.2 f) | ✅ Implementado | `samples.received_at`. |
| Fecha(s) de realización del ensayo | 7.8.2 g) | ✅ Implementado | `results.analysis_start`, `results.analysis_end`. |
| Fecha de emisión del informe | 7.8.2 h) | ✅ Implementado | `reports.issued_at`. |
| Referencia al plan de muestreo y procedimiento (si aplica) | 7.8.2 i) | ⚠️ Parcial | `samples.plan_code` existe; referencia al procedimiento de muestreo pendiente en la plantilla. |
| Declaración de que los resultados aplican solo a los ítems ensayados | 7.8.2 j) | ⚠️ Pendiente | Incluir en el texto fijo de la plantilla. |
| Resultados con unidades de medida (cuando aplica) | 7.8.2 k) | ✅ Implementado | `results.numeric_value`, `results.unit`, `results.reported_text`. |
| Adiciones, desviaciones o exclusiones del método | 7.8.2 l) | ⚠️ Parcial | Desviaciones en `sample_receptions.deviations`. Inclusión en el informe depende del diseño de la plantilla. |
| Identificación del personal que autorizó el informe | 7.8.2 m) | ✅ Implementado | `reports.approved_by`, `reports.reviewed_by`. |
| Declaración de responsabilidad cuando los resultados provienen de proveedores externos | 7.8.2 n) | ⚠️ Pendiente | El sistema marca los resultados subcontratados (`results.execution_type = 'SUBCONTRACTED'`), pero la declaración de responsabilidad debe incluirse en la plantilla. |

#### 7.8.3 — Requisitos específicos para informes de ensayo

| Requisito | Referencia norma | Estado en LabRepSys | Observación |
|-----------|-----------------|-------------------|-------------|
| Incertidumbre de medición (cuando sea pertinente para la validez del resultado) | 7.8.3 a) | ✅ Implementado | `results.uncertainty_text`. Cálculo de la incertidumbre es responsabilidad del analista; el sistema solo almacena el texto. |
| Condiciones bajo las cuales se realizaron los ensayos que influyen en los resultados | 7.8.3 b) | ⚠️ Parcial | Condiciones de llegada en `sample_receptions.arrival_conditions`. Condiciones ambientales del laboratorio no están en el sistema. |
| Declaración de conformidad con especificación o norma (cuando aplica) | 7.8.3 c) | ⚠️ Parcial — pendiente DP-007..010 | El sistema almacena los límites normativos (`regulation_limits`) pero la declaración de conformidad y la regla de decisión están pendientes de las decisiones DP-007 a DP-010. |
| Opiniones e interpretaciones (cuando aplica) | 7.8.3 d) | ⚠️ Pendiente | El sistema no tiene campo para opiniones e interpretaciones del analista en el informe. Evaluar si aplica para el alcance del LAA. |
| Información adicional requerida por métodos específicos, autoridades u organismos | 7.8.3 e) | ⚠️ Pendiente | Depende del alcance de acreditación. Revisar con el área de calidad. |

#### 7.8.4 — Requisitos específicos para informes de muestreo

Aplica cuando el laboratorio realiza el muestreo (campo). El sistema tiene el módulo de datos de campo (`FieldDataPage`).

| Requisito | Referencia norma | Estado en LabRepSys | Observación |
|-----------|-----------------|-------------------|-------------|
| Fecha del muestreo | 7.8.4 a) | ✅ Implementado | `samples.sampled_at`. |
| Identificación del ítem o material muestreado | 7.8.4 b) | ✅ Implementado | Código de muestra, punto de muestreo. |
| Lugar del muestreo (con croquis o mapa si es necesario) | 7.8.4 c) | ⚠️ Parcial | `samples.sampling_point` (texto). No hay georeferenciación ni mapa. Evaluar si es requerido. |
| Referencia al plan y procedimiento de muestreo | 7.8.4 d) | ⚠️ Parcial | `samples.plan_code`. Referencia al procedimiento formal pendiente. |
| Condiciones ambientales durante el muestreo | 7.8.4 e) | ✅ Implementado | `sample_field_data`, `sample_field_measurements` (módulo de campo). |
| Identificación de los criterios de evaluación del muestreo | 7.8.4 f) | ⚠️ Pendiente | Revisar con el área de calidad si aplica para el alcance. |

#### 7.8.5 — Declaración de conformidad

| Requisito | Referencia norma | Estado en LabRepSys | Observación |
|-----------|-----------------|-------------------|-------------|
| La declaración de conformidad debe identificar qué resultados son conformes / no conformes | 7.8.5 a) | ⚠️ Pendiente — DP-007..010 | Requiere implementar la lógica de comparación resultado vs. límite normativo y la regla de decisión acordada con el cliente. |
| La declaración debe especificar la regla de decisión aplicada | 7.8.5 b) | ⚠️ Parcial | La regla de decisión se registra en la recepción (`request_review.decision_rule`). La aplicación automática en el informe está pendiente de DP-007..010. |

#### 7.8.6 — Expresión de opiniones e interpretaciones

| Requisito | Referencia norma | Estado en LabRepSys | Observación |
|-----------|-----------------|-------------------|-------------|
| Las opiniones e interpretaciones deben estar claramente marcadas como tales | 7.8.6 | ⚠️ Pendiente | El sistema no tiene campo diferenciado para opiniones del analista vs. resultados objetivos. |

#### 7.8.7 — Modificaciones a los informes

| Requisito | Referencia norma | Estado en LabRepSys | Observación |
|-----------|-----------------|-------------------|-------------|
| Los informes modificados deben identificar claramente qué se cambió | 7.8.7 | ✅ Implementado | El mecanismo de rectificación crea una nueva versión numerada con motivo de rectificación. El reporte original queda en estado RECTIFICADO con trazabilidad completa. |
| Los informes emitidos solo se pueden modificar mediante un nuevo informe que haga referencia explícita al original | 7.8.7 | ✅ Implementado | `reports.replaces_report_id` vincula la nueva versión al original. |

---

### Cláusula 8.4 — Gestión de registros

| Requisito | Estado en LabRepSys | Observación |
|-----------|-------------------|-------------|
| Los registros deben ser legibles e identificables | ✅ Implementado | Base de datos estructurada con IDs únicos y marcas de tiempo. |
| Los registros deben ser almacenados, protegidos y respaldados | ⚠️ Parcial — pendiente DP-016 | Almacenamiento en Supabase (nube). Procedimiento de respaldo en `docs/RESPALDO.md`; RPO/RTO pendientes de DP-016. |
| Los registros deben conservarse por el tiempo especificado en los requisitos | ⚠️ Pendiente | Tiempo de retención no configurado en el sistema. Ver Parte I, §8 de este documento. |
| Los registros técnicos deben incluir suficiente información para reproducir el resultado | ✅ Implementado | El snapshot de emisión congela todos los datos del reporte (muestras, resultados, normativa, plantilla) con hash SHA-256. |

---

### Resumen de brechas y acciones pendientes

| ID | Requisito | Prioridad | Acción requerida |
|----|-----------|-----------|-----------------|
| ISO-01 | Título y membrete oficiales del laboratorio en el informe | Alta | Diseñar y aprobar la plantilla oficial del informe (DP-012) |
| ISO-02 | Declaración de conformidad con regla de decisión | Alta | Resolver DP-007 a DP-010; implementar lógica de comparación resultado vs. límite |
| ISO-03 | Número de página y total de páginas en el PDF | Media | Implementar en la generación del PDF del informe |
| ISO-04 | Declaración de responsabilidad por resultados subcontratados | Media | Incluir texto estándar en la plantilla aprobada |
| ISO-05 | Declaración de que los resultados aplican solo a los ítems ensayados | Media | Incluir texto estándar en la plantilla aprobada |
| ISO-06 | Referencia al procedimiento de muestreo (no solo al código de plan) | Media | Vincular `samples.plan_code` al catálogo de procedimientos o incluir referencia en la plantilla |
| ISO-07 | Condiciones ambientales del laboratorio durante el ensayo | Media | Evaluar si aplica para el alcance de acreditación; implementar campo si es necesario |
| ISO-08 | Tiempo formal de retención de registros configurado en el sistema | Media | Definir política de retención y configurarla en el sistema (alineada con DP-016) |
| ISO-09 | Campo para opiniones e interpretaciones diferenciado de resultados | Baja | Evaluar con el área de calidad si aplica para el alcance del LAA |
| ISO-10 | Georeferenciación del punto de muestreo | Baja | Evaluar si el alcance de acreditación lo exige; implementar si es necesario |

---

> **Próximos pasos:**
> 1. El área jurídica revisa la Parte I (Habeas Data) y complementa los campos pendientes ([nombre del responsable], [correo de contacto], etc.).
> 2. El área de calidad revisa la Parte II (ISO 17025) contra la versión oficial de la norma y el alcance específico de la acreditación del laboratorio.
> 3. Resolver las decisiones DP-007 a DP-012 para habilitar la declaración de conformidad y el diseño oficial del informe.
> 4. Registrar la base de datos ante la SIC (Superintendencia de Industria y Comercio) según lo exige la Ley 1581.
