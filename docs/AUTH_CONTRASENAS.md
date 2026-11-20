# Flujo de contraseñas

| Ruta | Para qué |
|---|---|
| `#/auth/confirm?token_hash=…&type=invite\|recovery` | Destino de los correos. Muestra un botón **Continuar**, y el token se canjea (`verifyOtp`) solo al pulsarlo. Así, los filtros de correo que abren el enlace para inspeccionarlo no gastan el token de un solo uso. |
| `#/auth/set-password` | Crear la contraseña (invitación) o cambiarla (recuperación). Exige una sesión válida. |
| `#/forgot-password` | Pedir el correo de recuperación. La respuesta es siempre la misma, exista o no la cuenta. |
| `#/login` | Inicio de sesión con mensaje genérico ante cualquier fallo y enlace a «¿Olvidaste tu contraseña?». |

## Reglas

- **Mensajes genéricos.** Ningún mensaje revela si un correo existe, si se alcanzó el límite de envíos ni detalles internos. Solo los fallos de red se informan como tales.
- **Contraseña:** mínimo 8 caracteres, máximo 72 bytes (límite de bcrypt), sin espacios al inicio ni al final. Si Supabase tiene una política más estricta, su error `weak_password` se traduce al usuario.
- El token sale de la barra de direcciones al canjearlo (`navigate(..., { replace: true })`).
- Se mantiene la compatibilidad con los enlaces antiguos de flujo implícito (`#access_token=…`) en `LoginPage`, hasta que todas las invitaciones viejas venzan.

## Configuración en Supabase (la hace el administrador; el código no la aplica)

En **Authentication → URL Configuration**:

- **Site URL:** `https://feliperoma04.github.io/LabRepSys/`
- **Redirect URLs:** agrega `https://feliperoma04.github.io/LabRepSys/**` y, para desarrollo, `http://localhost:5173/**`.

En **Authentication → Email Templates**, cambia el enlace de estas plantillas:

| Plantilla | Enlace |
|---|---|
| Invite user | `{{ .SiteURL }}#/auth/confirm?token_hash={{ .TokenHash }}&type=invite` |
| Reset password | `{{ .SiteURL }}#/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |

La Site URL debe terminar en `/`, para que quede `…/LabRepSys/#/auth/confirm`. Usa `{{ .TokenHash }}`, no `{{ .ConfirmationURL }}`: este último canjea el token en el servidor de Supabase al abrirse, y eso anula la protección del botón.

## Prueba manual tras configurar

1. Invita a un usuario de prueba y abre el correo. El enlace debe llevar a «Activar tu cuenta»; al pulsar **Continuar**, debe pasar a «Crear contraseña».
2. Abre el mismo enlace por segunda vez. Debe mostrar el mensaje de enlace no válido o vencido.
3. En «¿Olvidaste tu contraseña?», prueba con un correo inexistente y con uno real. Ambos deben mostrar el mismo mensaje, y solo el real recibe correo.
