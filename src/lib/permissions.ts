// Permissions
// - SUPERUSER: View shipments, create release, create/delete shipments, manage suppliers,
// create employee, create admin, manage users, change longevity, change common name,
// change logo of butterfly, create institution, cross-tenant access, manage butterflies
// - ADMIN: View shipments, create release, create/delete shipments, manage suppliers,
// create employee, manage users, change longevity, change common name,
// change logo of butterfly
// - EMPLOYEE: View shipments, create release, create shipments,
// change longevity, change common name (institution-level species overrides)
export type Role = "SUPERUSER" | "ADMIN" | "EMPLOYEE" | string;

export type Permission =
  | "VIEW_DASHBOARD"
  | "VIEW_SHIPMENTS"
  | "CREATE_RELEASE"
  | "CREATE_SHIPMENT"
  | "DELETE_SHIPMENT"
  | "VIEW_INVENTORY"
  | "EDIT_INVENTORY"
  | "VIEW_ORGANIZATION"
  | "MANAGE_SUPPLIERS"
  | "CREATE_EMPLOYEE"
  | "CREATE_ADMIN"
  | "MANAGE_USERS"
  | "CHANGE_BUTTERFLY"
  | "CREATE_INSTITUTION"
  | "CROSS_TENANT_ACCESS"
  | "MANAGE_BUTTERFLIES"
  | "VIEW_REPORTS"
  | "MANAGE_INSTITUTION";

export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  SUPERUSER: [
    "VIEW_DASHBOARD",
    "VIEW_SHIPMENTS",
    "CREATE_RELEASE",
    "CREATE_SHIPMENT",
    "DELETE_SHIPMENT",
    "VIEW_INVENTORY",
    "EDIT_INVENTORY",
    "VIEW_ORGANIZATION",
    "MANAGE_SUPPLIERS",
    "CREATE_EMPLOYEE",
    "CREATE_ADMIN",
    "MANAGE_USERS",
    "CHANGE_BUTTERFLY",
    "CREATE_INSTITUTION",
    "CROSS_TENANT_ACCESS",
    "MANAGE_BUTTERFLIES",
    "VIEW_REPORTS",
    "MANAGE_INSTITUTION",
  ],
  ADMIN: [
    "VIEW_DASHBOARD",
    "VIEW_SHIPMENTS",
    "CREATE_RELEASE",
    "CREATE_SHIPMENT",
    "DELETE_SHIPMENT",
    "VIEW_INVENTORY",
    "EDIT_INVENTORY",
    "VIEW_ORGANIZATION",
    "MANAGE_SUPPLIERS",
    "CREATE_EMPLOYEE",
    "MANAGE_USERS",
    "CREATE_ADMIN",
    "CHANGE_BUTTERFLY",
    "VIEW_REPORTS",
  ],
  EMPLOYEE: [
    "VIEW_DASHBOARD",
    "VIEW_SHIPMENTS",
    "VIEW_ORGANIZATION",
    "CREATE_RELEASE",
    "CREATE_SHIPMENT",
    "CHANGE_BUTTERFLY",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = PERMISSION_MATRIX[role as Role];
  if (!perms) return false;
  return perms.includes(permission);
}
