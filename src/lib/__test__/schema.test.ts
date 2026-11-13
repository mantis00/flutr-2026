import { getTableName } from "drizzle-orm";
import {
  institutions,
  institution_news,
  users,
  butterfly_species,
  suppliers,
  butterfly_species_institution,
  shipments,
  shipment_items,
  release_events,
  in_flight,
  release_event_losses,
} from "@/lib/schema";

describe("schema", () => {
  describe("table names", () => {
    it("defines all expected tables", () => {
      expect(getTableName(institutions)).toBe("institutions");
      expect(getTableName(institution_news)).toBe("institution_news");
      expect(getTableName(users)).toBe("users");
      expect(getTableName(butterfly_species)).toBe("butterfly_species");
      expect(getTableName(suppliers)).toBe("suppliers");
      expect(getTableName(butterfly_species_institution)).toBe("butterfly_species_institution");
      expect(getTableName(shipments)).toBe("shipments");
      expect(getTableName(shipment_items)).toBe("shipment_items");
      expect(getTableName(release_events)).toBe("release_events");
      expect(getTableName(in_flight)).toBe("in_flight");
      expect(getTableName(release_event_losses)).toBe("release_event_losses");
    });
  });

  describe("institutions", () => {
    it("has required columns", () => {
      const columns = Object.keys(institutions);
      expect(columns).toContain("id");
      expect(columns).toContain("slug");
      expect(columns).toContain("name");
      expect(columns).toContain("street_address");
      expect(columns).toContain("city");
      expect(columns).toContain("state_province");
      expect(columns).toContain("postal_code");
      expect(columns).toContain("country");
      expect(columns).toContain("iabes_member");
      expect(columns).toContain("stats_active");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });

    it("has optional columns", () => {
      const columns = Object.keys(institutions);
      expect(columns).toContain("extended_address");
      expect(columns).toContain("time_zone");
      expect(columns).toContain("phone_number");
      expect(columns).toContain("email_address");
      expect(columns).toContain("theme_colors");
      expect(columns).toContain("website_url");
      expect(columns).toContain("facility_image_url");
      expect(columns).toContain("logo_url");
      expect(columns).toContain("description");
      expect(columns).toContain("social_links");
    });
  });

  describe("institution_news", () => {
    it("has required columns", () => {
      const columns = Object.keys(institution_news);
      expect(columns).toContain("id");
      expect(columns).toContain("institution_id");
      expect(columns).toContain("title");
      expect(columns).toContain("content");
      expect(columns).toContain("is_active");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });

    it("has optional columns", () => {
      const columns = Object.keys(institution_news);
      expect(columns).toContain("image_url");
    });
  });

  describe("users", () => {
    it("has required columns", () => {
      const columns = Object.keys(users);
      expect(columns).toContain("id");
      expect(columns).toContain("name");
      expect(columns).toContain("email");
      expect(columns).toContain("password_hash");
      expect(columns).toContain("institution_id");
      expect(columns).toContain("role");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });
  });

  describe("butterfly_species", () => {
    it("has required columns", () => {
      const columns = Object.keys(butterfly_species);
      expect(columns).toContain("id");
      expect(columns).toContain("scientific_name");
      expect(columns).toContain("common_name");
      expect(columns).toContain("family");
      expect(columns).toContain("sub_family");
      expect(columns).toContain("lifespan_days");
      expect(columns).toContain("range");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });

    it("has optional columns", () => {
      const columns = Object.keys(butterfly_species);
      expect(columns).toContain("description");
      expect(columns).toContain("host_plant");
      expect(columns).toContain("habitat");
      expect(columns).toContain("fun_facts");
      expect(columns).toContain("img_wings_open");
      expect(columns).toContain("img_wings_closed");
      expect(columns).toContain("extra_img_1");
      expect(columns).toContain("extra_img_2");
    });
  });

  describe("suppliers", () => {
    it("has required columns", () => {
      const columns = Object.keys(suppliers);
      expect(columns).toContain("id");
      expect(columns).toContain("name");
      expect(columns).toContain("code");
      expect(columns).toContain("country");
      expect(columns).toContain("is_active");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });

    it("has optional columns", () => {
      const columns = Object.keys(suppliers);
      expect(columns).toContain("website_url");
    });
  });

  describe("butterfly_species_institution", () => {
    it("has required columns", () => {
      const columns = Object.keys(butterfly_species_institution);
      expect(columns).toContain("id");
      expect(columns).toContain("butterfly_species_id");
      expect(columns).toContain("institution_id");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });

    it("has optional columns", () => {
      const columns = Object.keys(butterfly_species_institution);
      expect(columns).toContain("common_name_override");
      expect(columns).toContain("lifespan_override");
    });
  });

  describe("shipments", () => {
    it("has required columns", () => {
      const columns = Object.keys(shipments);
      expect(columns).toContain("id");
      expect(columns).toContain("institution_id");
      expect(columns).toContain("supplier_code");
      expect(columns).toContain("shipment_date");
      expect(columns).toContain("arrival_date");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });
  });

  describe("shipment_items", () => {
    it("has required columns", () => {
      const columns = Object.keys(shipment_items);
      expect(columns).toContain("id");
      expect(columns).toContain("shipment_id");
      expect(columns).toContain("institution_id");
      expect(columns).toContain("butterfly_species_id");
      expect(columns).toContain("number_received");
      expect(columns).toContain("emerged_in_transit");
      expect(columns).toContain("damaged_in_transit");
      expect(columns).toContain("diseased_in_transit");
      expect(columns).toContain("parasite");
      expect(columns).toContain("parasite_wasp_count");
      expect(columns).toContain("parasite_fly_count");
      expect(columns).toContain("parasite_description");
      expect(columns).toContain("non_emergence");
      expect(columns).toContain("poor_emergence");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });
  });

  describe("release_events", () => {
    it("has required columns", () => {
      const columns = Object.keys(release_events);
      expect(columns).toContain("id");
      expect(columns).toContain("institution_id");
      expect(columns).toContain("shipment_id");
      expect(columns).toContain("release_date");
      expect(columns).toContain("created_at");
    });

    it("has optional columns", () => {
      const columns = Object.keys(release_events);
      expect(columns).toContain("released_by");
    });
  });

  describe("in_flight", () => {
    it("has required columns", () => {
      const columns = Object.keys(in_flight);
      expect(columns).toContain("id");
      expect(columns).toContain("institution_id");
      expect(columns).toContain("release_event_id");
      expect(columns).toContain("shipment_item_id");
      expect(columns).toContain("quantity");
      expect(columns).toContain("created_at");
    });
  });

  describe("release_event_losses", () => {
    it("has required columns", () => {
      const columns = Object.keys(release_event_losses);
      expect(columns).toContain("id");
      expect(columns).toContain("institution_id");
      expect(columns).toContain("release_event_id");
      expect(columns).toContain("shipment_item_id");
      expect(columns).toContain("damaged_in_transit");
      expect(columns).toContain("diseased_in_transit");
      expect(columns).toContain("parasite");
      expect(columns).toContain("non_emergence");
      expect(columns).toContain("poor_emergence");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });
  });
});
