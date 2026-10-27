# Flutr Backend API Architecture

Authoritative spec for the backend API layer.

---

## 1. Route Groups & URL Structure

All routes live under `src/app/api`. Three primary route groups plus auth:

- **Public (no auth)**: `/api/public/*`
- **Tenant-scoped (authenticated)**: `/api/tenant/*`
- **Platform (SUPERUSER only)**: `/api/platform/*`
- **Auth**: `/api/auth/[...nextauth]`

---

## 2. Three-Layer Architecture

All authenticated routes follow a strict three-layer pattern:

```
Route → Service → Query
```

| Layer       | Location                       | Responsibility                                                                       |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| **Route**   | `src/app/api/*/route.ts`       | Read headers/params/body, validate input, call service, map errors to HTTP responses |
| **Service** | `src/lib/services/tenant-*.ts` | Auth check, permission check, tenant resolution, call query                          |
| **Query**   | `src/lib/queries/*.ts`         | Raw database access only; no auth or tenant resolution logic                         |

**Routes must never call queries directly** for authenticated resources. All auth, authorization, and tenant resolution belongs in the service layer.

---

## 3. Tenant Context — Slug-Based

### Overview

Tenant context is passed from the client via an HTTP request header:

```
x-tenant-slug: <institution-slug>
```

The route reads the header and passes the slug to the service. The service resolves the institution ID from the slug using `resolveTenantBySlug`, enforcing tenant isolation at that point.

### Slug vs ID Rule

- **Slug** (`x-tenant-slug` header) — used exclusively for tenant context in all tenant routes.
- **ID** (URL path segment) — used exclusively to target a specific platform resource in platform routes.
- No tenant route accepts `institutionId` in a body or query parameter.

### Route responsibility

```typescript
const slug = request.headers.get("x-tenant-slug");
if (!slug) return invalidRequest("Missing tenant slug");

const result = await tenantService({ slug, ...otherInputs });
```

### Service responsibility

```typescript
export async function getTenantFoo({ slug }: { slug: string }) {
  const user = requireUser(await auth());

  if (!canDoFoo(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, slug);

  return fooQuery(tenantId, ...);
}
```

### `resolveTenantBySlug` behavior (`src/lib/tenant.ts`)

1. Looks up the institution by slug in the database.
2. If not found → throws `"NOT_FOUND"`.
3. If the calling user is not SUPERUSER and their `institutionId` does not match → throws `"FORBIDDEN"`.
4. Returns the resolved `institutionId` (a number).

SUPERUSER can resolve any valid slug. Non-SUPERUSER can only resolve their own institution's slug.

### SUPERUSER tenant access

- SUPERUSER does **not** use `institutionId` in tenant routes — there is no mechanism to do so.
- All cross-tenant access is performed via the `x-tenant-slug` header, identical to any other user.
- `resolveTenantBySlug` skips the institution match check for SUPERUSER and resolves any valid slug.
- No tenant route schema accepts `institutionId` as input; `.strict()` validation will reject it as an unknown field.

### Query responsibility

Queries for tenant-owned data receive the already-resolved `institutionId` (a number). They must
never receive `slug` or perform slug lookups. Global reference data can be exposed through tenant
routes after the service layer resolves the slug for authorization; suppliers currently follow that
pattern.

```typescript
export async function listFooForTenant(institutionId: number, user: AuthenticatedUser) {
  const condition = tenantCondition(user, foo.institution_id, institutionId);
  return db.select().from(foo).where(condition);
}
```

---

## 4. Slug-Based Input Isolation

When a service receives a combined input object (`{ slug, ...fields }`), it must strip `slug` before passing data to the query layer:

```typescript
// createTenantUser
const { slug, ...userData } = data;
return createUser(tenantId, userData);

// updateTenantUser
const { slug, userId, ...updateData } = data;
return updateUserForTenant(userId, tenantId, user, updateData);
```

Queries must never receive `slug`.

---

## 5. Authentication & Session

- NextAuth 5, credentials provider, JWT sessions.
- JWT carries `id`, `role`, and `institutionId`.
- `requireUser(session)` — throws `"UNAUTHORIZED"` if no valid session; returns `AuthenticatedUser`.
- `AuthenticatedUser` = `{ id: number; role: UserRole; institutionId: number | null }`.
- SUPERUSER has `institutionId = null` (or may have one for testing); `resolveTenantBySlug` does not use it — slug lookup is authoritative.

---

## 6. Authorization

- All role checks go through `src/lib/authz.ts` helpers. No raw `user.role === ...` in routes or services.
- Role hierarchy: `EMPLOYEE (0) < ADMIN (1) < SUPERUSER (2)`.
- Domain helpers: `canManageUsers`, `canModifyUser`, `canAssignRole`, `canDeleteUser`, `canManageInstitutionProfile`, etc.
- Roles cannot be assigned above the actor's own rank.
- Cross-tenant modifications are blocked by `resolveTenantBySlug` before authz helpers are reached.

---

## 7. Validation Layer

- All input validated with Zod schemas using `.strict()` (unknown fields rejected).
- Schemas live in `src/lib/validation/` organized by domain.
- Sanitization (`sanitizeText`, `sanitizedNonEmpty`) happens in the validation layer only — never in routes or services.
- Tenant context (`x-tenant-slug`) is **not** a validated body/query field — it is a request header read directly by the route.
- `institutionId` must not appear in any body or query schema for tenant routes.
- Shipment dates use `@/lib/date-only` to accept valid `YYYY-MM-DD` values or full ISO timestamps with seconds and a `Z`/`±HH:MM` timezone (optional fractional seconds). Malformed suffixes are rejected; the written calendar date is preserved. Shipment read/export queries return `YYYY-MM-DD` strings using SQL `to_char`.

---

## 8. Error Response Contract

All errors use a consistent JSON envelope:

```jsonc
{
  "error": {
    "code": "INVALID_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | INTERNAL_ERROR",
    "message": "Human readable message",
    "details": [{ "path": "field.path", "message": "Validation message" }],
  },
}
```

`details` is only present for validation errors.

### Status codes

| Code  | Meaning                                                                                       |
| ----- | --------------------------------------------------------------------------------------------- |
| `400` | Invalid input (validation failure, missing slug header)                                       |
| `401` | Not authenticated                                                                             |
| `403` | Permission denied or wrong-tenant slug (slug exists but belongs to a different institution)   |
| `404` | Resource does not exist                                                                       |
| `409` | Conflict (unique constraint violation or domain-state conflict, e.g. quantity/rollback guard) |
| `500` | Unexpected internal error                                                                     |

### Sentinel error → HTTP mapping (route catch blocks)

```typescript
catch (error) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") return unauthorized();
    if (error.message === "FORBIDDEN") return forbidden();
    if (error.message === "NOT_FOUND") return notFound("...");
  }
  const tenantError = handleTenantError(error);
  if (tenantError) return tenantError;
  return internalError();
}
```

`handleTenantError` maps `TENANT_ERRORS` constants (cross-tenant access, missing tenant) to `forbidden()` or `notFound()`.

---

## 9. Tenant Routes

All tenant routes use the `x-tenant-slug` header for tenant context. Missing header returns `400 INVALID_REQUEST`. SUPERUSER may use any slug; non-SUPERUSER attempting a mismatched slug receives `403 FORBIDDEN`.

| Route                                        | Methods            |
| -------------------------------------------- | ------------------ |
| `/api/tenant/users`                          | GET, POST          |
| `/api/tenant/users/[id]`                     | GET, PATCH, DELETE |
| `/api/tenant/institution`                    | GET, PATCH         |
| `/api/tenant/suppliers`                      | GET                |
| `/api/tenant/species`                        | GET                |
| `/api/tenant/species/[id]`                   | PATCH              |
| `/api/tenant/news`                           | GET, POST          |
| `/api/tenant/news/[id]`                      | PATCH, DELETE      |
| `/api/tenant/shipments`                      | GET, POST          |
| `/api/tenant/shipments/[id]`                 | GET, PATCH, DELETE |
| `/api/tenant/shipments/[id]/releases`        | GET, POST          |
| `/api/tenant/releases/[releaseId]`           | GET, PATCH, DELETE |
| `/api/tenant/releases/[releaseId]/in-flight` | POST               |
| `/api/tenant/in-flight/[id]`                 | PATCH, DELETE      |

---

## 10. Testing Requirements

Tests live in `src/__test__/api/**` and mirror the route tree.

### All tenant route tests must include

- `400` — missing `x-tenant-slug` header (one per HTTP method)
- `400` — invalid input (bad body, invalid id param)
- `401` — unauthenticated (mock service throws `"UNAUTHORIZED"`)
- `403` — forbidden (mock service throws `"FORBIDDEN"`)
- `404` — not found
- `200` — happy path with correct `toHaveBeenCalledWith` assertions

### `toHaveBeenCalledWith` must match service signatures exactly

```typescript
// GET list
expect(mockGetTenantFoo).toHaveBeenCalledWith({ slug: "butterfly-house" });

// GET by id
expect(mockGetTenantFooById).toHaveBeenCalledWith({ id: 2, slug: "butterfly-house" });

// POST / PATCH — use objectContaining for partial matching
expect(mockCreateTenantFoo).toHaveBeenCalledWith(
  expect.objectContaining({ slug: "butterfly-house", name: "Foo" }),
);
```

### Request helpers must include the header

```typescript
const SLUG = "butterfly-house";

function makeGetRequest(slug?: string) {
  const headers: Record<string, string> = {};
  if (slug) headers["x-tenant-slug"] = slug;
  return new NextRequest("http://localhost/api/tenant/foo", { headers });
}
```

Omit `slug` to test the missing-header `400` case. Never pass `institutionId` as a query param or body field in tenant route tests.

---

## 11. Shipment Deletion Rules

Deleting a shipment removes shipment-owned dependent records in the query layer before deleting the shipment header. Shared/reference data is preserved.

### Shipment-owned records deleted

| Dependent table        | Reason                                                 |
| ---------------------- | ------------------------------------------------------ |
| `in_flight`            | Release quantities point at shipment items             |
| `release_event_losses` | Release loss history points at shipment items/events   |
| `release_events`       | Release history belongs to the shipment                |
| `shipment_items`       | Line items and transit/loss metrics belong to shipment |

Shared records such as `butterfly_species`, users, institutions, and suppliers are not deleted.

### Behavior

- Single-shipment deletion requires `DELETE_SHIPMENT` through `canDeleteShipment`: ADMIN and SUPERUSER only. EMPLOYEE receives `403 FORBIDDEN`; tenant resolution still enforces institution access.
- The delete runs inside a transaction and scopes every operation by `institution_id`.
- Shipment-owned children are deleted before the shipment header to satisfy foreign-key constraints.
- A shipment with or without items/releases can be deleted normally (`200 OK`).
- Legitimate failures still return the appropriate route-level error (`401`, `403`, `404`, or `500`).

---

## 12. Drift Prevention

- **No `institutionId` in body/query schemas** for tenant routes — schemas use `.strict()` and will reject it as an unknown field.
- **No slug in query layer** — services must strip `slug` before calling queries.
- **No raw role checks** in routes or services — use `canX(...)` helpers from `authz.ts`.
- **No query calls from routes** — routes call services; services call queries.
