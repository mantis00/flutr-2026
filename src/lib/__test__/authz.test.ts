import {
  requireUser,
  normalizeRole,
  AUTH_ERRORS,
  canDeleteShipment,
  canWriteShipment,
} from "@/lib/authz";
import { hasPermission } from "@/lib/permissions";
import type { Session } from "next-auth";

function makeSession(
  overrides: Partial<{ id: string; role: string; institutionId: number | null }>,
): Session {
  const { id = "1", role = "EMPLOYEE", institutionId = 1 } = overrides;
  return {
    expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    user: { id, role, institutionId } as Session["user"],
  };
}

describe("requireUser", () => {
  it("accepts EMPLOYEE role", () => {
    const user = requireUser(makeSession({ role: "EMPLOYEE" }));
    expect(user.role).toBe("EMPLOYEE");
  });

  it("accepts ADMIN role", () => {
    const user = requireUser(makeSession({ role: "ADMIN" }));
    expect(user.role).toBe("ADMIN");
  });

  it("accepts SUPERUSER role", () => {
    const user = requireUser(makeSession({ role: "SUPERUSER" }));
    expect(user.role).toBe("SUPERUSER");
  });

  it("rejects legacy 'user' role (DB default — must be normalized before JWT is issued)", () => {
    expect(() => requireUser(makeSession({ role: "user" }))).toThrow(AUTH_ERRORS.UNAUTHORIZED);
  });

  it("rejects unknown roles", () => {
    expect(() => requireUser(makeSession({ role: "unknown" }))).toThrow(AUTH_ERRORS.UNAUTHORIZED);
  });

  it("throws UNAUTHORIZED when session is null", () => {
    expect(() => requireUser(null)).toThrow(AUTH_ERRORS.UNAUTHORIZED);
  });

  it("throws UNAUTHORIZED when id is missing", () => {
    const session = makeSession({});
    (session.user as unknown as Record<string, unknown>).id = undefined;
    expect(() => requireUser(session)).toThrow(AUTH_ERRORS.UNAUTHORIZED);
  });

  it("normalizes institutionId to null when not provided", () => {
    const user = requireUser(makeSession({ institutionId: null }));
    expect(user.institutionId).toBeNull();
  });

  it("rejects invalid institutionId (zero)", () => {
    const session = makeSession({});
    (session.user as unknown as Record<string, unknown>).institutionId = 0;
    expect(() => requireUser(session)).toThrow(AUTH_ERRORS.UNAUTHORIZED);
  });
});

describe("normalizeRole", () => {
  it("maps 'user' (DB default) to EMPLOYEE", () => {
    expect(normalizeRole("user")).toBe("EMPLOYEE");
  });

  it("maps 'EMPLOYEE' to EMPLOYEE", () => {
    expect(normalizeRole("EMPLOYEE")).toBe("EMPLOYEE");
  });

  it("keeps ADMIN as ADMIN", () => {
    expect(normalizeRole("ADMIN")).toBe("ADMIN");
  });

  it("keeps SUPERUSER as SUPERUSER", () => {
    expect(normalizeRole("SUPERUSER")).toBe("SUPERUSER");
  });

  it("maps unknown/arbitrary roles to EMPLOYEE", () => {
    expect(normalizeRole("unknown")).toBe("EMPLOYEE");
    expect(normalizeRole("")).toBe("EMPLOYEE");
  });
});

describe("shipment deletion permission", () => {
  it.each([
    ["ADMIN", true],
    ["SUPERUSER", true],
    ["EMPLOYEE", false],
  ] as const)("grants DELETE_SHIPMENT to %s: %s", (role, allowed) => {
    const user = requireUser(makeSession({ role }));

    expect(hasPermission(role, "DELETE_SHIPMENT")).toBe(allowed);
    expect(canDeleteShipment(user)).toBe(allowed);
  });

  it("preserves EMPLOYEE shipment creation without granting deletion", () => {
    const user = requireUser(makeSession({ role: "EMPLOYEE" }));

    expect(canWriteShipment(user)).toBe(true);
    expect(canDeleteShipment(user)).toBe(false);
  });

  it("does not grant shipment deletion to unknown roles", () => {
    expect(hasPermission("unknown", "DELETE_SHIPMENT")).toBe(false);
  });
});
