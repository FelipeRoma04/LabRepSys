# Correo de invitación y recuperación de contraseña

El flujo de la aplicación permite solicitar un enlace, confirmar el token y establecer una contraseña. Las plantillas HTML de Supabase están versionadas en `supabase/templates/`:

- `recovery.html`: recuperación de contraseña.
- `invite.html`: crear contraseña al aceptar una invitación.
- `password_changed_notification.html`: aviso después de cambiar la contraseña.

La configuración está en `supabase/config.toml`. El proyecto de LabRepSys es `yhieruklrmbsirhvobcr`. La URL de retorno de Pages ya se actualizó en producción. Supabase rechazó la publicación de asuntos y cuerpos HTML porque el proyecto usa el proveedor de correo predeterminado del plan Free; esas plantillas están versionadas, pero aún no están activas.

## Habilitar plantillas en producción

Para que los correos de invitación y recuperación usen estas plantillas en español, configura un proveedor SMTP propio en **Authentication → SMTP Settings** o habilita la función de plantillas en el plan del proyecto. No guardes credenciales SMTP en el repositorio. Después de configurar el proveedor, revisa el diff con `supabase config diff --project-ref yhieruklrmbsirhvobcr` y publica con `supabase config push --project-ref yhieruklrmbsirhvobcr`.

Con el proveedor predeterminado, Supabase conserva su remitente y plantilla estándar en inglés. La aplicación permite completar el flujo, pero no puede cambiar el cuerpo de ese correo.

## URLs de Auth

En Supabase Dashboard, en **Authentication → URL Configuration**:

- **Site URL:** `https://feliperoma04.github.io/LabRepSys`
- **Redirect URLs:** `https://feliperoma04.github.io/LabRepSys/**` y `http://localhost:5173/**` para desarrollo.

El enlace de recuperación usa `{{ .RedirectTo }}`, que la app fija a `#/auth/confirm`. El de invitación usa `{{ .SiteURL }}/#/auth/confirm`. Ambos pasan `token_hash` y el tipo correspondiente (`recovery` o `invite`). La aplicación muestra un botón **Continuar** y solo canjea el token cuando la persona lo pulsa; así los escáneres automáticos no consumen el enlace.

### Enlaces de la plantilla por defecto de Supabase

Mientras no estén activas las plantillas propias, el correo estándar de Supabase apunta a su servidor: Supabase canjea el enlace allí y redirige a la app con los tokens en un segundo fragmento, por ejemplo `/#/auth/confirm#access_token=…&refresh_token=…&type=recovery`. `/auth/confirm` también acepta ese formato:

- abre la sesión con `supabase.auth.setSession`, quita los tokens de la barra de direcciones con `history.replaceState` y continúa a `/auth/set-password`;
- si Supabase devuelve un error (`#error=access_denied&error_code=otp_expired&…`), muestra un mensaje claro: el enlace venció o ya se usó y hay que pedir uno nuevo.

En este formato el token ya se gastó en el servidor de Supabase al abrir el enlace, así que un escáner de correo puede invalidarlo antes que la persona. Por eso conviene activar las plantillas propias, que usan `token_hash` y el botón **Continuar**.

## Flujo y mensajes

| Ruta | Función |
|---|---|
| `#/forgot-password` | Solicita el correo de recuperación. La respuesta no revela si la cuenta existe. |
| `#/auth/confirm` | Valida el enlace al pulsar **Continuar**. |
| `#/auth/set-password` | Recibe la nueva contraseña y la confirma. |
| `#/login` | Inicia sesión y ofrece el enlace de recuperación. |

Los enlaces usados, vencidos o inválidos muestran la opción de solicitar uno nuevo. El formulario exige mínimo 8 caracteres, limita a 72 bytes y no permite espacios al inicio o final. Los errores de correo y límites de envío no revelan información de la cuenta.

## Verificación manual

1. Desde el login, solicita recuperación para una cuenta de prueba. Una vez activado SMTP o la función de plantillas, el correo debe llegar en español con el asunto **Restablece tu contraseña de LabRepSys**.
2. Abre el correo y pulsa **Crear contraseña nueva**; confirma que la URL lleva a LabRepSys y muestra la pantalla de confirmación.
3. Pulsa **Continuar**, establece la contraseña y vuelve a iniciar sesión.
4. Prueba un enlace vencido o usado; debe permitir pedir uno nuevo.
5. Para invitaciones, verifica el asunto **Crea tu contraseña de LabRepSys** y el mismo flujo con el mensaje de activación.

No ejecutes estas pruebas con cuentas o enlaces de otras personas.
