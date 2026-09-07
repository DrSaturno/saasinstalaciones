import "server-only";

import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { fetchTwoFactorStatus, twoFactorGate } from "@/lib/data/two-factor";
import { createClient } from "@/lib/supabase/server";

/** Authorization for actions, including requests that bypass page layouts. */
export const getAuthorizedUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  if (twoFactorGate(await fetchTwoFactorStatus(supabase), user.role)) return null;
  return user;
});
