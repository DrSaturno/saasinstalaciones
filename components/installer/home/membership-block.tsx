import { ClipboardList, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MembershipBlock({
  kind,
  title,
  subtitle,
  children,
}: {
  kind: "installer" | "coordinator";
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const Icon = kind === "coordinator" ? ClipboardList : Wrench;

  return (
    <Card className={kind === "coordinator" ? "border-primary/30" : ""}>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>{title}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
