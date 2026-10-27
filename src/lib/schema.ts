import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
  boolean,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SpeciesFunFact } from "@/types/butterfly";

/**
 * Flutr V2 Schema
 *
 * Designed to:
 * - Support multi-tenant institutions (tenant = institution)
 * - Support user roles and permissions
 * - Normalize shipment data (header + line items)
 * - Store a single global master butterfly catalog
 * - Enable historical imports (2002–2026 Excel + legacy JSON)
 * - Support USDA yearly reporting exports
 * - Support release events linked to shipments for traceability
 *
 * Tenant model:
 * - Global (shared): butterfly_species
 * - Global supplier codes: suppliers
 * - Tenant-scoped (owned by institution): operational records such as shipments and releases
 *
 * Key safety guarantees:
 * - Global species cannot be deleted if referenced in tenant data (RESTRICT)
 * - Deleting an institution cascades all tenant-owned rows (CASCADE)
 * - Suppliers are soft-deletable via is_active (do not hard delete if referenced)
 * - Shipments store supplier abbreviation (supplier_code) as the USDA/Excel value
 * - DB-level supplier enforcement: a shipment’s supplier_code must exist globally
 * - DB-level tenant enforcement: a release_event’s shipment must belong to the SAME institution
 */

/**
 * Institutions (Multi-Tenant Root Entity)
 *
 * Each institution represents a butterfly house.
 * All operational tables reference institution_id for data isolation.
 */
export const institutions = pgTable("institutions", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),

  name: text("name").notNull(),
  main_header: text("main_header"),
  street_address: text("street_address").notNull(),
  extended_address: text("extended_address"),
  city: text("city").notNull(),
  state_province: text("state_province").notNull(),
  postal_code: text("postal_code").notNull(),
  time_zone: text("time_zone"),
  country: text("country").notNull(),

  phone_number: text("phone_number"),
  email_address: text("email_address").unique(),

  iabes_member: boolean("iabes_member").notNull().default(false),
  theme_colors: text("theme_colors").array(),

  website_url: text("website_url"),
  volunteer_url: text("volunteer_url"),
  donation_url: text("donation_url"),
  facility_image_url: text("facility_image_url"),
  logo_url: text("logo_url"),
  description: text("description"),
  social_links: jsonb("social_links"),
  stats_active: boolean("stats_active").notNull().default(true),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Institution News
 *
 * Supports multiple news entries per institution.
 * Front page will display the most recent active entry.
 *
 * Future-proof:
 * - Allows archiving
 * - Allows scheduling
 * - Allows history
 */
export const institution_news = pgTable(
  "institution_news",
  {
    id: serial("id").primaryKey(),

    institution_id: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    content: text("content").notNull(),
    image_url: text("image_url"),

    is_active: boolean("is_active").notNull().default(true),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Tenant-scoped lookups (active news for an institution)
    idx_institution_news_institution_id: index("idx_institution_news_institution_id").on(
      table.institution_id,
    ),
  }),
);

/**
 * Users
 *
 * Scoped to an institution.
 * Roles: SUPERUSER | ORG SUPER | ORG ADMIN | ORG EMPLOYEE (future enforcement via enum).
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),

    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password_hash: text("password_hash").notNull(),

    institution_id: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),

    role: text("role").notNull().default("user"),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Tenant-scoped user lookups
    idx_users_institution_id: index("idx_users_institution_id").on(table.institution_id),
  }),
);

/**
 * Global Butterfly Species Catalog
 *
 * Stores the single master list (~400 species).
 *
 * Why global?
 * - Client requirement: one shared master list
 * - Avoid duplication across institutions
 * - Enables searchable reference data
 * - Scalable and environment-consistent
 */
export const butterfly_species = pgTable("butterfly_species", {
  id: serial("id").primaryKey(),

  scientific_name: text("scientific_name").notNull().unique(),
  common_name: text("common_name").notNull(),

  family: text("family").notNull(),
  sub_family: text("sub_family").notNull(),

  lifespan_days: integer("lifespan_days").notNull(),

  range: text("range").array().notNull(),

  description: text("description"),

  host_plant: text("host_plant"),
  habitat: text("habitat"),
  fun_facts: jsonb("fun_facts").$type<SpeciesFunFact[]>(),

  img_wings_open: text("img_wings_open"),
  img_wings_closed: text("img_wings_closed"),
  extra_img_1: text("extra_img_1"),
  extra_img_2: text("extra_img_2"),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Institution Species Enable Table
 *
 * Joins butterfly_species to institutions with optional overrides.
 * Allows institutions to enable/disable species and provide custom data.
 * Supports future features like institution-specific fun facts or images.
 *
 * Why this approach?
 * - Client requirement: institutions want control over which species they display
 * - Avoids duplication of butterfly_species data across institutions
 * - Enables institution-specific customizations without altering global catalog
 * - Scalable as institutions grow and add more species
 */
export const butterfly_species_institution = pgTable(
  "butterfly_species_institution",
  {
    id: serial("id").primaryKey(),

    butterfly_species_id: integer("butterfly_species_id")
      .notNull()
      .references(() => butterfly_species.id, { onDelete: "restrict" }),

    institution_id: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),

    common_name_override: text("common_name_override"),
    lifespan_override: integer("lifespan_override"),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    unique_institution_species: uniqueIndex("unique_institution_species").on(
      table.butterfly_species_id,
      table.institution_id,
    ),

    // Tenant-scoped species lookups (gallery, home, species list)
    idx_bsi_institution_id: index("idx_bsi_institution_id").on(table.institution_id),
  }),
);

/**
 * Suppliers (global)
 *
 * Shared supplier code list used across institutions.
 * "Delete" in UI should generally mean is_active=false (soft delete).
 *
 * For historical imports:
 * - If a shipment references a supplier_code not present, create it with is_active=false.
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),

    name: text("name").notNull(),
    code: text("code").notNull(), // Supplier abbreviation/code used in USDA/Excel imports (e.g., "LPS", "EBN")

    country: text("country").notNull(),
    website_url: text("website_url"),

    is_active: boolean("is_active").notNull().default(true),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    unique_supplier_code: unique("unique_supplier_code").on(table.code),
  }),
);

/**
 * Shipments (Header)
 *
 * Shipments store supplier_code in the same USDA/Excel format.
 * DB-level supplier enforcement ensures supplier_code exists globally.
 */
export const shipments = pgTable(
  "shipments",
  {
    id: serial("id").primaryKey(),

    institution_id: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),

    supplier_code: text("supplier_code").notNull(),

    shipment_date: timestamp("shipment_date").notNull(),
    arrival_date: timestamp("arrival_date").notNull(),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Supplier enforcement: supplier_code must exist globally.
    fk_shipments_supplier_code: foreignKey({
      columns: [table.supplier_code],
      foreignColumns: [suppliers.code],
      name: "fk_shipments_supplier_code",
    }).onDelete("restrict"),

    // Needed for composite foreign keys that reference (institution_id, id)
    unique_shipment_id_per_institution: unique("unique_shipment_id_per_institution").on(
      table.institution_id,
      table.id,
    ),

    // Tenant-scoped shipment list ordered by shipment_date (listShipments)
    idx_shipments_institution_shipment_date: index("idx_shipments_institution_shipment_date").on(
      table.institution_id,
      table.shipment_date,
    ),
  }),
);

/**
 * Shipment Line Items
 *
 * Represents each butterfly species within a shipment.
 *
 * This matches:
 * - Historical Excel structure
 * - Legacy JSON payloads
 * - USDA reporting structure
 *
 * All transit-related quality metrics stored here.
 */
export const shipment_items = pgTable(
  "shipment_items",
  {
    id: serial("id").primaryKey(),

    // NEW: tenant column for DB enforcement
    institution_id: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),

    shipment_id: integer("shipment_id").notNull(),

    butterfly_species_id: integer("butterfly_species_id")
      .notNull()
      .references(() => butterfly_species.id, { onDelete: "restrict" }),

    number_received: integer("number_received").notNull(),

    emerged_in_transit: integer("emerged_in_transit").notNull().default(0),
    damaged_in_transit: integer("damaged_in_transit").notNull().default(0),
    diseased_in_transit: integer("diseased_in_transit").notNull().default(0),
    parasite: integer("parasite").notNull().default(0),
    non_emergence: integer("non_emergence").notNull().default(0),
    poor_emergence: integer("poor_emergence").notNull().default(0),
    good_emergence: integer("good_emergence").default(0),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    unique_shipment_species: uniqueIndex("unique_shipment_species").on(
      table.shipment_id,
      table.butterfly_species_id,
    ),

    // Transit quality metrics must be non-negative
    ck_shipment_items_good_emergence_nonnegative: check(
      "ck_shipment_items_good_emergence_nonnegative",
      sql`${table.good_emergence} >= 0`,
    ),

    // Lookup shipment items by institution + species (gallery/home aggregation)
    idx_shipment_items_institution_species: index("idx_shipment_items_institution_species").on(
      table.institution_id,
      table.butterfly_species_id,
    ),

    // Needed so other tables can FK to (institution_id, id)
    unique_shipment_item_id_per_institution: unique("unique_shipment_item_id_per_institution").on(
      table.institution_id,
      table.id,
    ),

    // Tenant enforcement: shipment_item must belong to a shipment in same tenant
    fk_shipment_items_shipment_institution: foreignKey({
      columns: [table.institution_id, table.shipment_id],
      foreignColumns: [shipments.institution_id, shipments.id],
      name: "fk_shipment_items_shipment_institution",
    }).onDelete("cascade"),
  }),
);

/**
 * Release Events (tenant-scoped)
 *
 * DB-level tenant enforcement ensures the referenced shipment belongs to the SAME institution.
 * released_by is stored as plain text to preserve audit name even if user accounts change/deactivate.
 */
export const release_events = pgTable(
  "release_events",
  {
    id: serial("id").primaryKey(),

    institution_id: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),

    shipment_id: integer("shipment_id").notNull(),

    release_date: timestamp("release_date").notNull(),
    released_by: text("released_by").notNull(),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fk_release_events_shipment_institution: foreignKey({
      columns: [table.institution_id, table.shipment_id],
      foreignColumns: [shipments.institution_id, shipments.id],
      name: "fk_release_events_shipment_institution",
    }).onDelete("cascade"),

    // Needed so in_flight can FK to (institution_id, id)
    unique_release_event_id_per_institution: unique("unique_release_event_id_per_institution").on(
      table.institution_id,
      table.id,
    ),

    // Tenant-scoped release list ordered by release_date (listInstitutionReleases)
    idx_release_events_institution_release_date: index(
      "idx_release_events_institution_release_date",
    ).on(table.institution_id, table.release_date),

    // Shipment-scoped release history ordered by release_date (listReleaseEventsForShipment)
    idx_release_events_institution_shipment_release_date: index(
      "idx_release_events_institution_shipment_release_date",
    ).on(table.institution_id, table.shipment_id, table.release_date),
  }),
);

/**
 * In-Flight Items
 *
 * Represents each butterfly species released within a release event.
 * Allows tracking quantity and quality of released butterflies.
 *
 */
export const in_flight = pgTable(
  "in_flight",
  {
    id: serial("id").primaryKey(),

    // NEW: tenant column for DB enforcement
    institution_id: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),

    release_event_id: integer("release_event_id").notNull(),
    shipment_item_id: integer("shipment_item_id").notNull(),

    quantity: integer("quantity").notNull(),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    unique_in_flight_shipment_item: uniqueIndex("unique_in_flight_shipment_item").on(
      table.release_event_id,
      table.shipment_item_id,
    ),

    // Lookup in-flight rows by institution + shipment item (gallery/home aggregation)
    idx_in_flight_institution_shipment_item: index("idx_in_flight_institution_shipment_item").on(
      table.institution_id,
      table.shipment_item_id,
    ),

    // in_flight must belong to same tenant as release_event
    fk_in_flight_event_institution: foreignKey({
      columns: [table.institution_id, table.release_event_id],
      foreignColumns: [release_events.institution_id, release_events.id],
      name: "fk_in_flight_event_institution",
    }).onDelete("cascade"),

    // in_flight must belong to same tenant as shipment_item
    fk_in_flight_shipment_item_institution: foreignKey({
      columns: [table.institution_id, table.shipment_item_id],
      foreignColumns: [shipment_items.institution_id, shipment_items.id],
      name: "fk_in_flight_shipment_item_institution",
    }).onDelete("restrict"),
  }),
);

/**
 * Release Event Loss Attribution
 *
 * Stores event-level loss quantities attributed during a specific release.
 * `shipment_items` remains the source of truth for current totals; this table
 * is workflow/history attribution only.
 */
export const release_event_losses = pgTable(
  "release_event_losses",
  {
    id: serial("id").primaryKey(),

    institution_id: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),

    release_event_id: integer("release_event_id").notNull(),
    shipment_item_id: integer("shipment_item_id").notNull(),

    damaged_in_transit: integer("damaged_in_transit").notNull().default(0),
    diseased_in_transit: integer("diseased_in_transit").notNull().default(0),
    parasite: integer("parasite").notNull().default(0),
    non_emergence: integer("non_emergence").notNull().default(0),
    poor_emergence: integer("poor_emergence").notNull().default(0),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    unique_release_event_losses_shipment_item: uniqueIndex(
      "unique_release_event_losses_shipment_item",
    ).on(table.release_event_id, table.shipment_item_id),

    idx_release_event_losses_institution_event: index(
      "idx_release_event_losses_institution_event",
    ).on(table.institution_id, table.release_event_id),

    idx_release_event_losses_institution_shipment_item: index(
      "idx_release_event_losses_institution_shipment_item",
    ).on(table.institution_id, table.shipment_item_id),

    fk_release_event_losses_event_institution: foreignKey({
      columns: [table.institution_id, table.release_event_id],
      foreignColumns: [release_events.institution_id, release_events.id],
      name: "fk_release_event_losses_event_institution",
    }).onDelete("cascade"),

    fk_release_event_losses_shipment_item_institution: foreignKey({
      columns: [table.institution_id, table.shipment_item_id],
      foreignColumns: [shipment_items.institution_id, shipment_items.id],
      name: "fk_release_event_losses_shipment_item_institution",
    }).onDelete("restrict"),

    ck_release_event_losses_damaged_nonnegative: check(
      "ck_release_event_losses_damaged_nonnegative",
      sql`${table.damaged_in_transit} >= 0`,
    ),
    ck_release_event_losses_diseased_nonnegative: check(
      "ck_release_event_losses_diseased_nonnegative",
      sql`${table.diseased_in_transit} >= 0`,
    ),
    ck_release_event_losses_parasite_nonnegative: check(
      "ck_release_event_losses_parasite_nonnegative",
      sql`${table.parasite} >= 0`,
    ),
    ck_release_event_losses_non_emergence_nonnegative: check(
      "ck_release_event_losses_non_emergence_nonnegative",
      sql`${table.non_emergence} >= 0`,
    ),
    ck_release_event_losses_poor_emergence_nonnegative: check(
      "ck_release_event_losses_poor_emergence_nonnegative",
      sql`${table.poor_emergence} >= 0`,
    ),
  }),
);
