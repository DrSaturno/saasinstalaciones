import { describe, expect, it } from "vitest";
import { activeMembershipRoles, rolesByUser } from "./membership-roles";

describe("capacidades de membresía", () => {
  it("conserva instalación y coordinación para una persona con ambos roles", () => {
    const roles = activeMembershipRoles(
      [{ company_id: "company-a", installer_id: "user-1" }],
      [
        { company_id: "company-a", user_id: "user-1", role: "installer" },
        { company_id: "company-a", user_id: "user-1", role: "coordinator" },
      ],
    );

    expect(rolesByUser(roles).get("user-1")).toEqual([
      "installer",
      "coordinator",
    ]);
  });

  it("descarta roles de membresías inactivas y deduplica capacidades", () => {
    const roles = activeMembershipRoles(
      [{ company_id: "company-a", installer_id: "user-1" }],
      [
        { company_id: "company-a", user_id: "user-1", role: "installer" },
        { company_id: "company-a", user_id: "user-1", role: "installer" },
        { company_id: "company-b", user_id: "user-1", role: "coordinator" },
      ],
    );

    expect(rolesByUser(roles).get("user-1")).toEqual(["installer"]);
  });
});
