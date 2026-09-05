-- Cierra tres funciones internas que quedaban invocables desde el navegador.
--
-- **Qué estaba pasando.** En Postgres una función nace ejecutable por `public`,
-- y `anon`/`authenticated` heredan eso. El resultado: 33 funciones
-- `security definer` —que corren con los privilegios de su dueño y por lo tanto
-- saltean RLS— eran alcanzables con la clave anónima, que es pública por diseño
-- y viaja dentro del bundle del navegador.
--
-- La mayoría se defiende sola: verifica al llamante con `auth_role()`,
-- `auth_has_company_role()` y compañía, así que una llamada sin sesión falla.
-- `promote_installer_to_coordinator` y `demote_coordinator_to_installer` no
-- verifican, pero delegan en `grant_company_member_role` /
-- `revoke_company_member_role`, que sí lo hacen, y la verificación mira el JWT
-- del llamante original: quedan cubiertas.
--
-- **Las tres de abajo no verifican nada y no las llama la aplicación** (sólo
-- figuran en `types/database.ts`, generado). La peor es
-- `persist_in_app_notification`: permitía que cualquiera creara una
-- notificación dentro del producto, para cualquier destinatario y con el texto
-- que quisiera. Eso es phishing servido desde la propia aplicación.
--
-- **Por qué revocar no rompe nada.** Sus dos llamadores en la base
-- (`assign_order_number` y `decide_survey_submission`) son `security definer`:
-- corren como su dueño y conservan el permiso. `record_notification_delivery_attempt`
-- la usa la Edge Function con `service_role`, que no pasa por estos grants.
--
-- Alcance deliberado: se revoca sólo estas tres. Las funciones auxiliares
-- (`auth_role`, `can_read_location`, etc.) siguen accesibles porque las
-- políticas RLS las evalúan con el rol de quien consulta; revocarlas dejaría al
-- usuario sin poder leer sus propios datos. Auditar el resto una por una queda
-- pendiente y anotado.

revoke execute on function public.persist_in_app_notification(
  uuid, uuid, uuid, text, text, uuid, text, text, jsonb, uuid, text
) from public, anon, authenticated;

revoke execute on function public.record_notification_delivery_attempt(
  uuid, boolean, text, text
) from public, anon, authenticated;

revoke execute on function public.next_regional_order_number(uuid, uuid)
  from public, anon, authenticated;
