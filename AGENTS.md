# Flutr

A WCAG-compliant, multi-tenant web application for butterfly houses to track shipments, quality metrics, and historical records while delivering public-facing galleries and statistics.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Package Manager**: pnpm
- **Styling**: Tailwind CSS 4
- **UI**: Shadcn/UI (Radix-based), Lucide icons, Sonner toasts, next-themes
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts
- **Maps**: React Simple Maps + world-atlas + world-countries
- **Auth**: NextAuth 5 (credentials provider, JWT sessions)
- **Database**: PostgreSQL 17 (Docker) + Drizzle ORM
- **Testing**: Jest
- **Deployment**: Docker Compose (PostgreSQL)

## Project Structure

```
src/
├── app/                    # Next.js pages and API routes
│   ├── (platform)/         # Superuser platform admin panel
│   │   └── admin/          # Platform admin routes (/admin/*)
│   │       ├── layout.tsx  # Admin shell (sidebar + header + footer)
│   │       ├── dashboard/  # Dashboard (nav cards)
│   │       ├── institutions/ # Institutions management
│   │       ├── species/    # Butterfly species management
│   │       └── suppliers/  # Suppliers management
│   ├── (home)/             # Public root routes (landing, login)
│   │   ├── page.tsx        # Root public landing page
│   │   └── login/          # Login page
│   ├── [institution]/      # Multi-tenant institution routes
│   │   ├── (tenant)/       # Protected tenant admin routes (sidebar + header + footer shell)
│   │   │   ├── dashboard/  # Admin dashboard
│   │   │   ├── butterflies/ # Per-institution species overrides (common name, lifespan)
│   │   │   ├── organization/ # Institution organization management
│   │   │   └── shipments/  # Shipment list, detail (force-edit + release history), add, create release (shipments/[id]/release/new), edit release (shipments/[id]/release/[releaseId]/edit)
│   │   └── (public)/       # Public-facing routes
│   │       ├── gallery/    # Butterfly species gallery
│   │       ├── stats/      # Institution statistics
│   │       └── [butterfly]/ # Individual species detail
│   └── api/                # API routes
│       ├── auth/[...nextauth]/ # NextAuth handlers
│       ├── public/         # Public no-auth API routes
│       ├── tenant/         # Tenant-scoped authenticated API routes
│       ├── platform/       # Platform/SUPERUSER API routes
├── components/             # React components by feature
│   ├── platform/           # Superuser platform admin components
│   │   ├── layout/         # PlatformSidebar, PlatformHeader, PlatformFooter, nav items
│   │   │   └── tenant/     # TenantHeader, TenantSidebar, TenantFooter, TenantNavList, nav items
│   │   ├── institutions/   # InstitutionsTable and related
│   │   └── detail/         # Institution detail tab components (DangerZone, FileDropZone, ImportResultsPanel, SectionInfo, ShipmentViewer)
│   │   ├── species/        # Platform species CRUD client, dialogs, table/cards, utilities
│   │   └── suppliers/      # SuppliersTable, toolbar, row, utils
│   ├── tenant/             # Tenant-facing feature components
│   │   ├── species/        # Tenant species override client, edit dialog, table/cards, utilities
│   │   ├── shipments/      # SpeciesPickerDialog, ShipmentItemsTable, ShipmentStatusBadge, SupplierSelect, types
│   │   └── releases/       # ReleaseCategoryComposer, ReleaseEditComposer, ReleaseQuantityControls
│   ├── nav/                # Public navigation components (top-nav, mobile-nav, footer)
│   ├── providers/          # Context providers (session, institution data, theme)
│   ├── public/             # Public-facing components (gallery, home, species detail)
│   ├── shared/             # Shared components used across public/admin (theme toggle, back button, nav card, DatePicker, species search toolbar)
│   └── ui/                 # 55 Shadcn/UI primitives
├── hooks/                  # Custom React hooks
│   ├── use-institution.ts  # Institution slug/basePath from URL params
│   ├── use-mobile.ts       # Responsive design hook
│   ├── use-shipment-delete.ts # Delete state, counts, and handleDelete for the Danger Zone
│   ├── use-shipment-import.ts # All import/export state and handlers for the data tab
│   ├── use-shipment-viewer.ts # Fetches and manages shipment summary list (auto-loads on mount)
│   ├── use-species-search.ts # Client-side species search, sort, filter, pagination
│   └── use-unsaved-changes-warning.ts # Confirms before unsaved form edits are lost
├── lib/                    # Utilities and configuration
│   ├── api-response.ts     # Standard API response helpers
│   ├── authz.ts            # Authorization policy helpers
│   ├── db.ts               # Drizzle ORM client
│   ├── queries/            # Server-side data queries (gallery, home, institution, shipments, suppliers, species, users, inflight, releases, news)
│   ├── services/           # Business logic layer (auth, permissions, tenant resolution)
│   ├── schema.ts           # Database schema definitions
│   ├── maps/               # Geographic mapping utilities/data wrappers for stats map
│   ├── tenant.ts           # Tenant resolution/enforcement helpers
│   ├── validation/         # Zod schemas + request/query helpers
│   ├── wingspan/           # Wingspan image microservice client (client.ts) + pure image helpers (images.ts)
│   ├── logger.ts           # Dev-only logging utility
│   ├── institution-profile-body.ts # Pure builder for the organization profile PATCH body (dirty fields only)
│   ├── shipment-import-utils.ts # Pure helpers for shipment import/export (SourceKind, detectSourceKind, readUploadFileAsText, formatShipmentDate, extractYear, filterRowsByDateRange)
│   └── utils.ts            # Shared utilities: Tailwind class merging (cn), downloadBlob
├── types/                  # TypeScript type definitions
│   ├── institution.ts      # Public institution type definitions
│   └── next-auth.d.ts      # NextAuth session augmentation
└── __test__/               # Jest test files
docs/                       # Project documentation
drizzle/                    # Generated database migrations
public/docs/field-guide/    # Annotated screenshots shown in the organization info modals
```

## Commands

```bash
pnpm dev            # Start dev server
pnpm build          # Production build
pnpm start          # Start production server
pnpm lint           # ESLint check
pnpm test           # Run Jest tests
pnpm format         # Format code with Prettier
pnpm format:check   # Check code formatting
pnpm db:generate    # Generate Drizzle migrations
pnpm db:migrate     # Run database migrations
pnpm db:push        # Push schema to database
pnpm db:studio      # Open Drizzle Studio GUI
```

## Key Patterns

- Path alias: `@/` maps to `/src/`
- Multi-tenant routing: `[institution]` dynamic segment isolates data per institution
- Institution validation: `[institution]/layout.tsx` calls `getPublicInstitution(slug)` and triggers `notFound()` if the institution doesn't exist. Child pages can use `(await getPublicInstitution(slug))!` (non-null assertion) since the layout guarantees validity and React `cache()` deduplicates the call. The root `src/app/not-found.tsx` catches the 404.
- Route groups: `(tenant)` for protected institution routes, `(public)` for public-facing institution routes, `(home)` for root public pages, `(platform)` for superuser platform pages
- Client components marked with `"use client"`
- API layer: Routes (validation + HTTP) → Services (auth, permissions, tenant logic) → Queries (DB only). Routes never call queries directly for authenticated resources.
- Auth: NextAuth 5 with credentials provider, JWT tokens carry `role` and `institutionId`
- Middleware: Protects `/:institution/(tenant)/*` routes via NextAuth. Platform UI routes (`/admin/*`) are guarded in `src/app/(platform)/admin/layout.tsx` using `auth()`, `requireUser()`, and `canCrossTenant()`.
- Database: Drizzle ORM with typed schema, PostgreSQL via Docker Compose
- UI components: Shadcn/UI installed via CLI, located in `src/components/ui/`
- Forms: React Hook Form with Zod schema validation
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`)

## Database Tables

- `institutions` — Multi-tenant organizations (slug, name, optional main_header, full address fields, IABES membership, stats_active flag, theming, contact info, timestamps). `main_header` overrides the default public homepage headline when set.
- `institution_news` — Institution-specific news entries (institution_id, title, content, is_active, optional image_url, timestamps)
- `users` — User accounts tied to an institution (name, globally unique email, password_hash, role, institution_id, timestamps)
- `butterfly_species` — Global master species catalog (scientific_name, common_name, family, sub_family, lifespan_days, range, optional description, host_plant, habitat, fun_facts, timestamps). Imagery lives in the Wingspan microservice, matched on `scientific_name` — the legacy `img_wings_open` / `img_wings_closed` / `extra_img_1` / `extra_img_2` columns still exist but are no longer read or written.
- `butterfly_species_institution` — Institution-specific overrides for global species (butterfly_species_id, institution_id, optional common_name_override, lifespan_override, timestamps). A row also marks the species as carried by that institution, which is what the public gallery lists. Edited at `/[institution]/butterflies`.
- `suppliers` — Butterfly suppliers/vendors (institution_id, name, code, country, is_active, optional website_url, timestamps)
- `shipments` — Shipment headers (institution_id, supplier_code, shipment_date, arrival_date, timestamps)
- `shipment_items` — Shipment line items per species (institution_id, shipment_id, butterfly_species_id, number_received, emerged_in_transit, damaged_in_transit, diseased_in_transit, parasite, non_emergence, poor_emergence, good_emergence, timestamps). `good_emergence` stores the cumulative Released total and is maintained in parallel with in_flight during release mutations. Current operational rows are numeric and default to 0; the nullable column reserves `NULL` for historical rows whose Released total was not tracked, which future historical-import work will introduce explicitly. `NULL` remains distinct from tracked 0. Release create/edit/delete operations keep numeric values synchronized by signed delta and reject `NULL` rows once they exist. Shipment Remaining/completion still reads from `in_flight`; `good_emergence` becomes the authoritative shipment-accounting source only after the read-switch phase. It is not yet exposed in any API/UI.
- `release_events` — Butterfly release events (institution_id, shipment_id, release_date, released_by, created_at, updated_at)
- `in_flight` — Species released during a release event (institution_id, release_event_id, shipment_item_id, quantity, created_at, updated_at)

## Documentation

Detailed documentation lives in `docs/`:

- `docs/overview.md` — Architecture overview
- `docs/rules/` — Development rules and conventions (centralized, referenced by both Claude and Cursor)
  - `api-routes.md` — API route conventions
  - `auth.md` — Authentication & authorization patterns
  - `database.md` — Drizzle ORM and database conventions
  - `accessibility.md` — WCAG 2.1 AA requirements
  - `docs.md` — Documentation maintenance guidelines
- `docs/commands/` — Agent command templates
  - `review.md` — Code review checklist
  - `deploy-check.md` — Pre-deployment verification
  - `test-and-fix.md` — Targeted test + fix workflow
- `docs/deployment/` — Production operations
  - `ssh-access.md` — Server access, key setup, and port forwarding
  - `deployments.md` — Applying schema migrations to production
  - `backups.md` — Database backup state, scheduled dumps, and restore procedure

## Conventions & Utilities

| Utility               | Import                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logger                | `logger` from `@/lib/logger`                                                                                                                | Use instead of `console.log` (dev-only log/warn/info/error)                                                                                                                                                                                                                                   |
| Class names           | `cn()` from `@/lib/utils`                                                                                                                   | Always use for conditional/merged Tailwind class names                                                                                                                                                                                                                                        |
| Blob download         | `downloadBlob(blob, fileName)` from `@/lib/utils`                                                                                           | Triggers a browser file download from a Blob; handles anchor creation and URL cleanup                                                                                                                                                                                                         |
| Shipment import utils | `detectSourceKind`, `readUploadFileAsText`, `formatShipmentDate`, `extractYear`, `filterRowsByDateRange` from `@/lib/shipment-import-utils` | Pure helpers for the shipment import/export flow; no React dependencies                                                                                                                                                                                                                       |
| Toasts                | `toast` from `sonner`                                                                                                                       | User feedback (success/error)                                                                                                                                                                                                                                                                 |
| API response helpers  | `ok`, `invalidRequest`, etc. from `@/lib/api-response`                                                                                      | Keep response envelopes/status mapping consistent                                                                                                                                                                                                                                             |
| Service layer         | `getTenantX`, `createTenantX`, etc. from `@/lib/services/*`                                                                                 | Routes call services; services own all auth + permission logic                                                                                                                                                                                                                                |
| Authorization helpers | `requireUser`, `canX(...)` from `@/lib/authz`                                                                                               | Used inside services, not routes directly                                                                                                                                                                                                                                                     |
| Tenant helpers        | `resolveTenantBySlug`, `tenantCondition`, `handleTenantError` from `@/lib/tenant`                                                           | `resolveTenantBySlug` resolves `x-tenant-slug` header in service layer; `tenantCondition` enforces isolation at query layer; `handleTenantError` maps tenant errors to 403/404 in catch blocks                                                                                                |
| Validation helpers    | `requireValidBody` / `requireValidQuery` from `@/lib/validation/*`                                                                          | Standardized request validation flow                                                                                                                                                                                                                                                          |
| Route constants       | `ROUTES` from `@/lib/routes`                                                                                                                | Centralized app route paths and builders (for example `/admin/*` and `/:institution/*`). Prefer this over hardcoded links/redirect strings.                                                                                                                                                   |
| Sanitize              | `sanitizeText` from `@/lib/validation/sanitize`                                                                                             | Strip HTML from user input                                                                                                                                                                                                                                                                    |
| Sanitized non-empty   | `sanitizedNonEmpty(maxLen)` from `@/lib/validation/sanitize`                                                                                | Sanitize + trim before enforcing non-empty (required texts)                                                                                                                                                                                                                                   |
| DB client             | `db` from `@/lib/db`                                                                                                                        | Drizzle ORM client with full schema                                                                                                                                                                                                                                                           |
| Schema                | `* from @/lib/schema`                                                                                                                       | All table definitions (institutions, users, species, etc.)                                                                                                                                                                                                                                    |
| Auth                  | `auth` from `@/auth`                                                                                                                        | NextAuth session helper                                                                                                                                                                                                                                                                       |
| Link (no prefetch)    | `Link` from `@/components/ui/link`                                                                                                          | Next.js Link without scroll-prefetch (hover/focus only). Used for large lists to reduce requests                                                                                                                                                                                              |
| Date picker           | `DatePicker` from `@/components/shared/date-picker`                                                                                         | Popover + calendar that stores its value as a `YYYY-MM-DD` string; supports `minDate` / `maxDate` bounds, `clearable` (adds a Clear control for optional bounds), `className` (trigger width) and `aria-invalid` / `aria-describedby`. Use instead of `<input type="date">`                   |
| Theme foreground      | `readableForeground`, `readableAccentOnDark`, `contrastRatio`, `relativeLuminance` from `@/lib/theme-color`                                 | `readableForeground` picks a legible `--primary-foreground` for an institution's theme color by measured contrast; `[institution]/layout.tsx` applies both as CSS variables. `readableAccentOnDark` falls back to white for theme colors too dark to read on the hero                         |
| Unsaved changes guard | `useUnsavedChangesWarning(enabled)`, `confirmDiscardUnsavedChanges()` from `@/hooks/use-unsaved-changes-warning`                            | Pass `form.formState.isDirty`. Prompts on reload/close via `beforeunload` and on in-app link clicks via a capture-phase guard. Controls that swap content without navigating (tabs) call `confirmDiscardUnsavedChanges()` in their own change handler. Reset the form after a successful save |
| Section info modal    | `SectionHeading`, `InfoUse` from `@/components/platform/institutions/detail/section-info`                                                   | Heading + "i" button that opens a modal explaining where a group of fields is used publicly. `InfoUse` takes `src`/`alt` for an annotated screenshot from `public/docs/field-guide/`                                                                                                          |
| Supplier select       | `SupplierSelect` from `@/components/tenant/shipments/supplier-select`                                                                       | Tenant-scoped supplier combobox used by the shipment add/edit forms                                                                                                                                                                                                                           |
| Profile PATCH body    | `buildProfileUpdateBody` from `@/lib/institution-profile-body`                                                                              | Builds the organization profile update payload from React Hook Form's `dirtyFields`, so an untouched field can't overwrite a concurrent edit                                                                                                                                                  |
| Shipment status badge | `ShipmentStatusBadge` from `@/components/tenant/shipments/shipment-status-badge`                                                            | Standard pill rendering for "In flight" / "Completed" shipment status                                                                                                                                                                                                                         |
| Shipment items table  | `ShipmentItemsTable` from `@/components/tenant/shipments/shipment-items-table`                                                              | Read-only + inline-editable species table wrapped in the shared search toolbar; enforces per-metric min/max client-side                                                                                                                                                                       |
| Species picker dialog | `SpeciesPickerDialog` from `@/components/tenant/shipments/species-picker-dialog`                                                            | Multi-select species picker backed by `useSpeciesSearch`; used by shipment add/edit                                                                                                                                                                                                           |
| Wingspan images       | `attachImages`, `attachImagesCamel`, `getSpeciesImages` from `@/lib/wingspan/client`                                                        | Server-only. Resolve butterfly imagery for query rows by `scientific_name`; one cached upstream call serves the whole batch. Returns `images: []` on a miss or outage — never throws.                                                                                                         |
| Image helpers         | `pickPrimary`, `tierUrl`, `labelFromTags`, `normalizeKey`, `WithImages<T>` from `@/lib/wingspan/images`                                     | Pure helpers + types. `images[0]` is the primary; each `SpeciesImage` carries pre-resolved `thumb` / `card` / `full` URLs — pick the one matching the rendered size.                                                                                                                          |
| Butterfly of the Day  | `getButterflyOfTheDay` from `@/lib/services/butterfly-of-the-day`                                                                           | Shared by the institution home and stats pages so both show the same species. Prefers candidates Wingspan has a photo for.                                                                                                                                                                    |
| Species overrides     | `resolveCommonName`, `resolveLifespan`, `hasOverride`, `filterSpecies` from `@/components/tenant/species/species.utils`                     | Resolve an institution's species overrides against the global catalog; an empty override counts as absent so a blank name never renders                                                                                                                                                       |
| Remaining helper      | `computeItemRemaining` from `@/components/tenant/shipments/types`                                                                           | Mirrors the DB `calculateRemaining` formula so client caps match the server                                                                                                                                                                                                                   |

## Workflow Rules

### Before Implementing

- Read relevant code and get full context before making changes
- Ask clarifying questions when requirements are unclear — do not assume intent
- Check accessibility implications for all UI changes (WCAG 2.1 AA required)

### During Implementation

- Leverage subagents to parallelize work when possible
- Do not run `pnpm build` for minor changes — the user runs builds manually after reviewing
- Follow the conventions and utilities documented above
- All public-facing interfaces must include proper ARIA attributes and keyboard navigation

### After Implementation

- Update documentation affected by the change (see `docs/rules/docs.md` for the full mapping)
- Key triggers: new/removed files → update Project Structure; new API routes → update endpoints; new tables → update Database Tables list; new utilities → update Conventions table

### Code Reviews

- Be comprehensive: check code quality, logic, security, accessibility, and test coverage
- Accessibility is a first-class concern — validate ARIA, color contrast, keyboard nav, screen reader support
- Tests should cover logic (not UI rendering)
- Leverage subagents to review different aspects in parallel
