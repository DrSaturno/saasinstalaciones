-- =============================================================
-- FIX: usuarios del seed no pueden loguearse
-- ("Database error querying schema" / 500 en /auth/v1/token)
--
-- Causa: al insertar filas en auth.users a mano, las columnas de token
-- quedan en NULL. GoTrue las lee como string de Go y NULL rompe el scan.
-- Deben ser string vacío ('').
--
-- Ejecutar una vez en el SQL Editor.
-- =============================================================

update auth.users set
  confirmation_token        = coalesce(confirmation_token, ''),
  recovery_token            = coalesce(recovery_token, ''),
  email_change              = coalesce(email_change, ''),
  email_change_token_new    = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change              = coalesce(phone_change, ''),
  phone_change_token        = coalesce(phone_change_token, ''),
  reauthentication_token    = coalesce(reauthentication_token, '')
where email like '%@instalapro.dev' or email like '%@demo.dev';

-- Verificación: deberían ser 5 usuarios, todos con confirmación de email.
select email, email_confirmed_at is not null as confirmado
from auth.users
where email like '%@instalapro.dev' or email like '%@demo.dev'
order by email;
