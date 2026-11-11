ALTER TABLE "institutions" ADD COLUMN "track_parasite_details" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN "parasite_unclassified" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "shipment_items" SET "parasite_unclassified" = "parasite";--> statement-breakpoint
ALTER TABLE "shipment_items" ADD COLUMN "parasite_details" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "ck_shipment_items_parasite_unclassified_nonnegative" CHECK ("shipment_items"."parasite_unclassified" >= 0);