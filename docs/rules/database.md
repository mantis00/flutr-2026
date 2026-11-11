# Database Conventions

## Schema

- All tables defined in `src/lib/schema.ts` using Drizzle ORM
- Use `pgTable()` for table definitions
- All tables include `created_at` and `updated_at` timestamps

## Client

- Import `db` from `@/lib/db` — singleton Drizzle client
- Import table definitions from `@/lib/schema`

## Migrations

- Schema changes: edit `src/lib/schema.ts`, then run `pnpm db:generate` + `pnpm db:migrate`
- Quick prototyping: use `pnpm db:push` to sync schema without migration files
- Use `pnpm db:studio` for visual database browsing
- Production migrations and how Drizzle tracks what to apply: [`../deployment/deployments.md`](../deployment/deployments.md)

## Multi-Tenant Queries

- Always filter by `institution_id` for tenant-scoped data
- Foreign keys use a mix of `CASCADE` and `RESTRICT`; verify behavior per relationship
- The `butterfly_species` table is global; `butterfly_species_institution` is per-tenant
- The `suppliers` table is global; shipments preserve historical supplier codes in `supplier_code`
- `shipment_items.parasite` remains the aggregate loss count. Keep `parasite_details` counts plus `parasite_unclassified` equal to it; backfill existing/imported counts as unclassified instead of inventing a type.

## Tenant Composite-Key Enforcement

Tenant isolation is enforced at the database level using composite foreign keys that include `institution_id`.

- `shipments (supplier_code) -> suppliers (code)` — `RESTRICT`
- `shipment_items (institution_id, shipment_id) -> shipments (institution_id, id)` — `CASCADE`
- `release_events (institution_id, shipment_id) -> shipments (institution_id, id)` — `CASCADE`
- `in_flight (institution_id, release_event_id) -> release_events (institution_id, id)` — `CASCADE`
- `in_flight (institution_id, shipment_item_id) -> shipment_items (institution_id, id)` — `RESTRICT`
- `release_event_losses (institution_id, release_event_id) -> release_events (institution_id, id)` — `CASCADE`
- `release_event_losses (institution_id, shipment_item_id) -> shipment_items (institution_id, id)` — `RESTRICT`

Composite tenant keys prevent cross-tenant references even if a raw numeric ID exists in another
institution. The supplier relationship is intentionally global by code so historical imports can
reuse shared supplier codes across institutions.

## Performance Indexes

Composite indexes are added when a query has a confirmed hot path with a filter + sort on the same table. Single-column indexes on `institution_id` alone are generally avoided because they are often redundant when another useful index already starts with `institution_id` or when composite FK/unique constraints cover the access pattern. They are still added for documented tenant-only list/look-up hot paths where no more specific `institution_id`-prefixed index already serves the query.

Current performance indexes:

| Index                                                  | Table                           | Columns                                       | Query                                           |
| ------------------------------------------------------ | ------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `idx_shipment_items_institution_species`               | `shipment_items`                | `(institution_id, butterfly_species_id)`      | Gallery/home aggregation                        |
| `idx_in_flight_institution_shipment_item`              | `in_flight`                     | `(institution_id, shipment_item_id)`          | In-flight sum aggregation                       |
| `idx_bsi_institution_id`                               | `butterfly_species_institution` | `(institution_id)`                            | Species list per institution                    |
| `idx_users_institution_id`                             | `users`                         | `(institution_id)`                            | User lookups per institution                    |
| `idx_institution_news_institution_id`                  | `institution_news`              | `(institution_id)`                            | News list per institution                       |
| `idx_shipments_institution_shipment_date`              | `shipments`                     | `(institution_id, shipment_date)`             | Paginated shipment list (filter + sort)         |
| `idx_release_events_institution_release_date`          | `release_events`                | `(institution_id, release_date)`              | Paginated release list (filter + sort)          |
| `idx_release_events_institution_shipment_release_date` | `release_events`                | `(institution_id, shipment_id, release_date)` | Shipment-scoped release history (filter + sort) |
| `idx_release_event_losses_institution_event`           | `release_event_losses`          | `(institution_id, release_event_id)`          | Release detail loss-attribution lookup          |
| `idx_release_event_losses_institution_shipment_item`   | `release_event_losses`          | `(institution_id, shipment_item_id)`          | Edit/delete rollback loss aggregation           |

## Docker

- PostgreSQL 17 via `docker-compose.yml`
- Default credentials: `postgres:postgres`, database: `flutr-db`
- Start with `docker compose up -d`
