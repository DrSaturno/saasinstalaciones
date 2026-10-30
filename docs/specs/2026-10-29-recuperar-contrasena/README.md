# Recuperar contraseña: el link del mail lleva a la página principal

## Qué pasó (29-10-2026)

Un instalador (Nahuel Gando) no podía entrar. Se le mandó el mail de recuperación de contraseña
desde el panel de Supabase («Send password recovery»), y el link lo dejaba en la página principal
de Se Instala en lugar de en la pantalla para elegir la contraseña nueva.

## Por qué

La app ya tenía la ruta que procesa el link (`/api/auth/callback`): acepta `token_hash` y
`code`, abre la sesión de recuperación y manda a `/reset-password`. Pero el link no llegaba ahí.
Supabase manda a la persona a la **Site URL** (la página principal) en dos casos:

1. **El mail se pidió desde el panel de Supabase.** Ese botón no sabe nada de la app: usa siempre la
   Site URL y entrega la sesión en el fragmento (`#access_token=…&type=recovery`), que el servidor
   no ve.
2. **`/api/auth/callback` no está en la lista de redirecciones permitidas.** Supabase ignora el
   `redirectTo` que pide la app y cae en la Site URL, con el código en la query (`?code=…`).

En los dos casos nadie leía el link y la persona quedaba en la landing.

## Requisitos

- **RECUP-01** — Un link de recuperación que caiga en `/` o en `/login` con el código en la query
  (`code`, `token_hash` + `type`, o `error_code`) se reenvía al callback.
- **RECUP-02** — Un link que traiga la sesión en el fragmento (flujo implícito, mail mandado desde
  el panel) abre la sesión en el navegador y lleva a `/reset-password`. Los tokens se sacan de la
  barra de direcciones antes que nada.
- **RECUP-03** — Un link vencido o ya usado termina en «El link no sirve» con el botón para pedir
  otro, cualquiera sea la forma en que llegó.
- **RECUP-04** — Después de guardar la contraseña nueva, la persona va directo a su panel (el proxy
  rutea `/` según el rol), sin volver a pedirle la contraseña recién elegida.
- **RECUP-05** — Nada de esto toca las visitas normales a la landing ni sus anclas (`#funciones`).
- **RECUP-06** — La pantalla de contraseña nueva (y la de «El link no sirve») usa el mismo marco que la
  invitación: escena del instalador, marca y campos de 48 px, en escritorio y en celular.
- **RECUP-07** — El mail de recuperación sale desde `no-responder@seinstala.com.ar` (SMTP propio por
  Resend) con la plantilla de marca de `email-reset-password.html`.

## Tareas

- [x] **RECUP-T-01** — `lib/domain/auth-callback.ts`: `isAuthCallbackQuery` y `parseAuthHash`,
  con pruebas. → RECUP-01, 02, 03, 05
- [x] **RECUP-T-02** — `proxy.ts`: reenvío al callback, antes de leer la sesión (alguien logueado
  con otra cuenta también tiene que poder canjear el link). Pruebas que llaman al proxy. → RECUP-01
- [x] **RECUP-T-03** — `components/auth/recovery-hash-handler.tsx` en el layout raíz. → RECUP-02, 03
- [x] **RECUP-T-04** — `reset-password-form.tsx`: «Entrar a mi panel» y redirección automática a
  `/` a los 1,5 s. → RECUP-04
- [x] **RECUP-T-05** — Verificado con navegador real contra Demo:
  - `/?code=falso` → callback → «El link no sirve»;
  - fragmento con link vencido → «El link no sirve»;
  - fragmento con sesión inválida → «El link no sirve», sin tokens en la URL;
  - `/?utm_source=…` y `/#funciones` → landing sin cambios.

  **Sin verificar:** el camino feliz con un link real. Requiere un mail de recuperación de verdad.
- [x] **RECUP-T-06** — Configuración del panel de Supabase en **producción** (hecha por Nicolás el
  29-10-2026): Site URL, Redirect URLs, SMTP de Resend y plantilla. Probado con un mail real: llegó
  desde `no-responder@seinstala.com.ar` y el botón abre la pantalla de contraseña nueva. → RECUP-07
- [x] **RECUP-T-07** — `reset-password/page.tsx` sobre `InvitationFrame`, con textos es/pt. → RECUP-06

## Configuración del panel de Supabase (Nicolás)

Con el código nuevo, el link funciona aunque la configuración esté mal. Igual conviene dejarla
bien: con la plantilla de abajo, el link funciona **aunque se abra en otro navegador o en otro
dispositivo**. El formato `code` (PKCE) sólo funciona en el mismo navegador que pidió el mail, y es
común pedirlo en la compu y abrirlo en el celular, o tocarlo dentro de la app de Gmail.

1. **Authentication → URL Configuration**
   - **Site URL:** `https://www.seinstala.com.ar`
   - **Redirect URLs:** agregar `https://www.seinstala.com.ar/api/auth/callback`
2. **Authentication → Emails → Templates → Reset Password**: reemplazar el link de la plantilla por
   este (copiarlo tal cual):

   ```html
   <h2>Recuperá tu contraseña de Se Instala</h2>
   <p>Tocá el botón para elegir una contraseña nueva. Si no lo pediste, ignorá este mail.</p>
   <p><a href="{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Elegir contraseña nueva</a></p>
   ```

   El callback ya acepta este formato. Abre la sesión del lado del servidor (`verifyOtp`), sin
   depender del navegador.
