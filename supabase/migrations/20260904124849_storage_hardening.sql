-- Auditoría de seguridad — SEC-05 y SEC-09 (docs/SECURITY_AUDIT.md).
--
-- Los tres buckets no tenían `file_size_limit` ni `allowed_mime_types`. La
-- validación de tipo del avatar era sólo del lado del cliente
-- (`file.type.startsWith("image/")`, que `image/svg+xml` pasa), y el bucket
-- `avatars` es PÚBLICO. Un `.svg` con `<script>` subido como avatar quedaba
-- servido con content-type SVG desde una URL pública.
--
-- Matiz de severidad, para ser honestos: Storage sirve desde
-- `<proyecto>.supabase.co`, otro origen que el de la app, así que un SVG con
-- script NO accede a la sesión de la app (cookies de otro origen), y un avatar
-- mostrado con `<img>` no ejecuta scripts igual. El riesgo real es abrir la
-- URL pública directa (phishing con un dominio supabase.co de apariencia
-- confiable) o un futuro embebido same-origin. Restringir el tipo es barato y
-- correcto: cierra la puerta antes de que importe.
--
-- `allowed_mime_types` lo valida Storage EN EL SERVIDOR contra el content-type
-- declarado. Un cliente que mienta el content-type (SVG declarado como PNG)
-- queda guardado y servido como PNG, así que el navegador tampoco ejecuta el
-- SVG. La allowlist raster neutraliza el XSS incluso ante spoofing.

-- avatars: sólo imágenes de trama. Se incluyen HEIC/HEIF porque las fotos de
-- iPhone llegan así si no se convierten. 5 MB = el límite que ya validaba el
-- cliente (`MAX_BYTES`).
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif'
    ]
where id = 'avatars';

-- evidence: imágenes + PDF, que es lo que aceptan los compositores
-- (`accept="image/*,application/pdf"`). 25 MB para fotos de campo de alta
-- resolución. Sin SVG.
update storage.buckets
set file_size_limit = 25 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif', 'application/pdf'
    ]
where id = 'evidence';

-- chat: SÓLO límite de tamaño, sin allowlist de tipos. El adjunto de chat no
-- tiene `accept` y transporta documentos arbitrarios (hay un .xlsx real
-- subido). Una allowlist rompería el compartir documentos. El riesgo es más
-- bajo que en avatars: bucket privado, aislado por tenant vía RLS y servido
-- por URL firmada de corta vida, todo en el origen supabase.co. Se acota el
-- tamaño; el tipo queda abierto a propósito.
update storage.buckets
set file_size_limit = 25 * 1024 * 1024
where id = 'chat';
