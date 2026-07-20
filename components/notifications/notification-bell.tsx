import { fetchNotificationInbox } from "@/lib/data/notifications";
import { createClient } from "@/lib/supabase/server";
import { NotificationMenu } from "@/components/notifications/notification-menu";

export async function NotificationBell() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const inbox = await fetchNotificationInbox(supabase);
  return (
    <NotificationMenu
      userId={user.id}
      initialInbox={inbox}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
    />
  );
}
