import { buildProfileUpdateBody, type ProfileBodyValues } from "@/lib/institution-profile-body";

const values: ProfileBodyValues = {
  name: "Butterfly Pavilion",
  slug: "butterfly-pavilion",
  main_header: "Where Wings Take Flight",
  description: "A description.",
  primary_color: "#0d9488",
  logo_url: "https://example.org/logo.png",
  facility_image_url: "https://example.org/hero.jpg",
  street_address: "1 Main St",
  extended_address: "Suite 2",
  city: "Westminster",
  state_province: "CO",
  postal_code: "80020",
  country: "USA",
  time_zone: "America/Denver",
  email_address: "hello@example.org",
  phone_number: "+1 555 0100",
  website_url: "https://example.org",
  volunteer_url: "https://example.org/volunteer",
  donation_url: "https://example.org/donate",
  social_twitter: "flutr",
  social_instagram: "",
  social_facebook: "",
  social_linkedin: "",
  social_youtube: "",
  stats_active: true,
  iabes_member: false,
};

const platform = { isTenant: false };

describe("buildProfileUpdateBody", () => {
  it("sends nothing when nothing was edited", () => {
    expect(buildProfileUpdateBody(values, {}, platform)).toEqual({});
  });

  it("sends only the edited field, so a stale snapshot can't revert others", () => {
    expect(buildProfileUpdateBody(values, { name: true }, platform)).toEqual({
      name: "Butterfly Pavilion",
    });
  });

  it("leaves a NULL theme color alone unless the color itself was edited", () => {
    const body = buildProfileUpdateBody(
      values,
      { description: true },
      {
        ...platform,
        existingThemeColors: null,
      },
    );

    expect(body).not.toHaveProperty("theme_colors");
  });

  it("keeps stored colors past the first when the color is edited", () => {
    const body = buildProfileUpdateBody(
      values,
      { primary_color: true },
      {
        ...platform,
        existingThemeColors: ["#111111", "#222222", "#333333"],
      },
    );

    expect(body.theme_colors).toEqual(["#0d9488", "#222222", "#333333"]);
  });

  it("clears blanked text fields that were edited", () => {
    const body = buildProfileUpdateBody(
      { ...values, main_header: "  ", description: "" },
      { main_header: true, description: true },
      platform,
    );

    expect(body).toEqual({ main_header: null, description: null });
  });

  it("sends the whole social_links map when any one link is edited", () => {
    const body = buildProfileUpdateBody(values, { social_instagram: true }, platform);

    expect(body).toEqual({ social_links: { twitter: "flutr" } });
  });

  it("omits slug and platform flags for tenants", () => {
    const body = buildProfileUpdateBody(
      values,
      { slug: true, stats_active: true, iabes_member: true, city: true },
      { isTenant: true },
    );

    expect(body).toEqual({ city: "Westminster" });
  });

  it("sends optional urls only when edited", () => {
    expect(buildProfileUpdateBody(values, { donation_url: true }, platform)).toEqual({
      donation_url: "https://example.org/donate",
    });
    expect(
      buildProfileUpdateBody({ ...values, volunteer_url: "" }, { volunteer_url: true }, platform),
    ).toEqual({
      volunteer_url: null,
    });
  });
});
