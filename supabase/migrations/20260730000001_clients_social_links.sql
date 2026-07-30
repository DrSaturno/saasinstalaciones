-- Presencia online del cliente: sitio web y redes.
--
-- La ficha tenía los datos de contacto directo (teléfono, email, dirección)
-- pero nada de dónde encontrarlo públicamente, que es lo primero que se mira
-- para entender a quién se le está instalando.
--
-- Se guardan como texto libre y no como URL completa: la gente escribe
-- "@lamarca" o "instagram.com/lamarca" indistintamente, y forzar un formato
-- acá haría fallar el alta por una barra de más. La normalización a link vive
-- en la vista, donde puede equivocarse sin romper nada.
--
-- Idempotente: se puede re-ejecutar sin daño.

alter table public.clients
  add column if not exists website text not null default '',
  add column if not exists instagram text not null default '',
  add column if not exists youtube text not null default '',
  add column if not exists tiktok text not null default '';

-- Sin cambios de RLS: `clients_company_operators_all` ya acota por empresa y
-- las columnas nuevas quedan cubiertas por la misma política.
