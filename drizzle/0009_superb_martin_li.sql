ALTER TABLE "shipment_items" ADD COLUMN "parasite_wasp_count" integer;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN "parasite_fly_count" integer;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "ck_shipment_items_parasite_breakdown_within_total" CHECK (("shipment_items"."parasite_wasp_count" is null or "shipment_items"."parasite_wasp_count" >= 0)
        and ("shipment_items"."parasite_fly_count" is null or "shipment_items"."parasite_fly_count" >= 0)
        and (
          ("shipment_items"."parasite_wasp_count" is null and "shipment_items"."parasite_fly_count" is null)
          or coalesce("shipment_items"."parasite_wasp_count", 0)::bigint
            + coalesce("shipment_items"."parasite_fly_count", 0)::bigint <= "shipment_items"."parasite"
        ));