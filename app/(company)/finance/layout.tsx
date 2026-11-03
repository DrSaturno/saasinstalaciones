import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import "@/components/company/finance-workspace.css";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user?.companyId || !user.canManageFinance) redirect("/dashboard");
  return <div className="finance-workspace">{children}</div>;
}
