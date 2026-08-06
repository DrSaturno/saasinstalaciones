import { describe, expect, it } from "vitest";
import { countCompanyUsers } from "./company-user-counts";

describe("conteo master de usuarios por empresa", () => {
  it("cuenta cada membresía activa en su empresa, incluso para usuarios multiempresa", () => {
    expect(
      countCompanyUsers(
        [
          { company_id: "company-a", installer_id: "field-1" },
          { company_id: "company-b", installer_id: "field-1" },
          { company_id: "company-a", installer_id: "field-2" },
        ],
        [
          { id: "manager-a", company_id: "company-a" },
          { id: "manager-b", company_id: "company-b" },
        ],
      ),
    ).toEqual({ "company-a": 3, "company-b": 2 });
  });

  it("deduplica una persona dentro de la misma empresa y omite managers sin tenant", () => {
    expect(
      countCompanyUsers(
        [
          { company_id: "company-a", installer_id: "field-1" },
          { company_id: "company-a", installer_id: "field-1" },
        ],
        [
          { id: "field-1", company_id: "company-a" },
          { id: "platform-admin", company_id: null },
        ],
      ),
    ).toEqual({ "company-a": 1 });
  });
});

