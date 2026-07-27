export type NavIcon =
  | "dashboard"
  | "projects"
  | "orders"
  | "team"
  | "broadcasts"
  | "finance"
  | "tasks"
  | "jobs"
  | "profile"
  | "companies"
  | "clients"
  | "messages"
  | "settings"
  | "route";

export type NavItem = { href: string; label: string; icon: NavIcon };
