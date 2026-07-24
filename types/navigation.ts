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
  | "messages";

export type NavItem = { href: string; label: string; icon: NavIcon };
