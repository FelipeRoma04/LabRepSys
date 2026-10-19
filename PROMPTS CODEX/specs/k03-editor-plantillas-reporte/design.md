# Design - K03

Punto de extension: pantalla /catalogos/plantillas (ya existe como CRUD basico de report_templates); agregar la ruta de detalle y editor sin rehacer el CRUD.
Datos: report_templates.configuration (jsonb) ya existe; agregar por migracion nueva las columnas approved_by y approved_at si faltan, y un bucket privado template-assets con politicas (ADMIN escribe; roles activos leen). Trigger que impide UPDATE de configuracion cuando status = APPROVED.
RPC approve_template(template_id) security definer: solo JEFE_TECNICA_CALIDAD; devuelve {ok:false,...} y audita el intento denegado. RPC new_template_version(template_id).
Frontend: formulario por secciones, validacion con un esquema (zod u equivalente ya instalado) y vista previa renderizada con CSS de impresion. TemplateConfig en src/types/templateConfig.ts es el contrato publico.
No modificar la emision ni la vista imprimible existentes; si ya existen, dejar nota en el PR sobre como adoptar TemplateConfig.
