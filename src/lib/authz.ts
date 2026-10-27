import type { Session } from "next-auth";
import type { Permission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

/**
 * Role system
 *
 * Note: The database currently stores roles as strings.
 * This type reflects the roles that are *enforced* at the API layer.
 */
export type UserRole = "EMPLOYEE" | "ADMIN" | "SUPERUSER";

/**
 * Maps legacy/default DB role values to the normalized role system.
 * The DB default is "user"; those users are treated as EMPLOYEE (lowest privilege).
 *
 * Call this in the auth `authorize` callback so every JWT token carries
 * a role value that `requireUser` will accept.
 */
export function normalizeRole(role: string): UserRole {
  if (role === "ADMIN" || role === "SUPERUSER") return role;
  // "user" (DB default) and "EMPLOYEE" both map to EMPLOYEE
  return "EMPLOYEE";
}

/**
 * Role hierarchy for comparison (lower = less privileged)
 * Used only for user-to-user relationship checks (can modify, assign role, delete)
 */
type RoleRank = Record<UserRole, number>;

const roleRank: RoleRank = {
  EMPLOYEE: 0,
  ADMIN: 1,
  SUPERUSER: 2,
};

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  institutionId: number | null;
}

type TargetUser = {
  id: number;
  role: UserRole | string;
  institutionId: number;
};

/**
 * Sentinel error messages used by API routes to map to HTTP status codes.
 */
export const AUTH_ERRORS = {
  UNAUTHORIZED: "UNAUTHORIZED",
} as const;

/**
 * Throws when there is no authenticated user.
 * API routes are responsible for catching this and returning 401.
 */
export function requireUser(session: Session | null): AuthenticatedUser {
  if (!session || !session.user) {
    throw new Error(AUTH_ERRORS.UNAUTHORIZED);
  }

  const { id, role, institutionId } = session.user as {
    id?: string | number;
    role?: string;
    institutionId?: number | string | null;
  };

  if (!id || !role) {
    throw new Error(AUTH_ERRORS.UNAUTHORIZED);
  }

  if (!isSupportedRole(role)) {
    throw new Error(AUTH_ERRORS.UNAUTHORIZED);
  }

  const normalizedId = String(id);
  const normalizedInstitutionId =
    institutionId === undefined || institutionId === null ? null : Number(institutionId);

  if (
    normalizedInstitutionId !== null &&
    (Number.isNaN(normalizedInstitutionId) || normalizedInstitutionId <= 0)
  ) {
    throw new Error(AUTH_ERRORS.UNAUTHORIZED);
  }

  return {
    id: normalizedId,
    role: role as UserRole,
    institutionId: normalizedInstitutionId,
  };
}

function isSupportedRole(role: string): role is UserRole {
  return role === "EMPLOYEE" || role === "ADMIN" || role === "SUPERUSER";
}

function hasAtLeast(user: AuthenticatedUser, minimum: UserRole): boolean {
  return roleRank[user.role] >= roleRank[minimum];
}

/**
 * Generic permission check using the unified permission matrix.
 * All authorization checks should delegate to this function.
 */
export function can(user: AuthenticatedUser, permission: Permission): boolean {
  return hasPermission(user.role, permission);
}

// Shipments & releases

export function canReadShipment(user: AuthenticatedUser): boolean {
  return can(user, "VIEW_SHIPMENTS");
}

export function canWriteShipment(user: AuthenticatedUser): boolean {
  return can(user, "CREATE_SHIPMENT");
}

export function canDeleteShipment(user: AuthenticatedUser): boolean {
  return can(user, "DELETE_SHIPMENT");
}

export function canCreateRelease(user: AuthenticatedUser): boolean {
  return can(user, "CREATE_RELEASE");
}

// Dashboard

export function canViewDashboard(user: AuthenticatedUser): boolean {
  return can(user, "VIEW_DASHBOARD");
}

// Inventory

export function canViewInventory(user: AuthenticatedUser): boolean {
  return can(user, "VIEW_INVENTORY");
}

export function canEditInventory(user: AuthenticatedUser): boolean {
  return can(user, "EDIT_INVENTORY");
}

// Suppliers

export function canReadSuppliers(user: AuthenticatedUser): boolean {
  return can(user, "VIEW_SHIPMENTS"); // Suppliers visible to those who can view shipments
}

export function canManageSuppliers(user: AuthenticatedUser): boolean {
  return can(user, "MANAGE_SUPPLIERS");
}

// Species

export function canReadSpecies(user: AuthenticatedUser): boolean {
  return hasAtLeast(user, "EMPLOYEE");
}

export function canManageSpeciesOverrides(user: AuthenticatedUser): boolean {
  return can(user, "CHANGE_BUTTERFLY");
}

// Institution profile

export function canManageInstitutionProfile(user: AuthenticatedUser): boolean {
  return hasAtLeast(user, "ADMIN");
}

// Platform / global

export function canCreateInstitution(user: AuthenticatedUser): boolean {
  return can(user, "CREATE_INSTITUTION");
}

export function canManageGlobalButterflies(user: AuthenticatedUser): boolean {
  return can(user, "MANAGE_BUTTERFLIES");
}

export function canCrossTenant(user: AuthenticatedUser): boolean {
  return can(user, "CROSS_TENANT_ACCESS");
}

// User management

export function canManageUsers(user: AuthenticatedUser): boolean {
  return can(user, "MANAGE_USERS");
}

export function canModifyUser(actor: AuthenticatedUser, target: TargetUser): boolean {
  if (!can(actor, "MANAGE_USERS")) {
    return false;
  }

  // Cross-tenant protection (VERY IMPORTANT)
  if (actor.role !== "SUPERUSER" && actor.institutionId !== target.institutionId) {
    return false;
  }

  return roleRank[actor.role] >= roleRank[target.role as UserRole];
}

export function canAssignRole(
  actor: AuthenticatedUser,
  newRole: UserRole,
  target?: TargetUser,
): boolean {
  if (!can(actor, "MANAGE_USERS")) {
    return false;
  }

  // Cannot assign a role higher than yourself
  if (roleRank[actor.role] < roleRank[newRole]) {
    return false;
  }

  if (target) {
    // Cross-tenant protection
    if (actor.role !== "SUPERUSER" && actor.institutionId !== target.institutionId) {
      return false;
    }

    // Cannot modify someone above you
    if (roleRank[actor.role] < roleRank[target.role as UserRole]) {
      return false;
    }
  }

  return true;
}

export function canDeleteUser(actor: AuthenticatedUser, target: TargetUser): boolean {
  if (!can(actor, "MANAGE_USERS")) {
    return false;
  }

  // Cannot delete yourself
  if (actor.id === String(target.id)) {
    return false;
  }

  // Cross-tenant protection
  if (actor.role !== "SUPERUSER" && actor.institutionId !== target.institutionId) {
    return false;
  }

  return roleRank[actor.role] > roleRank[target.role as UserRole];
}
