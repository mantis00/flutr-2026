import { NextRequest } from "next/server";

jest.mock("@/lib/services/tenant-news", () => ({
  getTenantNews: jest.fn(),
  createTenantNews: jest.fn(),
  updateTenantNewsEntry: jest.fn(),
  deleteTenantNewsEntry: jest.fn(),
}));

import {
  getTenantNews,
  createTenantNews,
  updateTenantNewsEntry,
  deleteTenantNewsEntry,
} from "@/lib/services/tenant-news";
import { GET as getNews, POST as postNews } from "@/app/api/tenant/news/route";
import { DELETE as deleteNews, PATCH as patchNews } from "@/app/api/tenant/news/[id]/route";

const mockGetTenantNews = getTenantNews as jest.Mock;
const mockCreateTenantNews = createTenantNews as jest.Mock;
const mockUpdateTenantNewsEntry = updateTenantNewsEntry as jest.Mock;
const mockDeleteTenantNewsEntry = deleteTenantNewsEntry as jest.Mock;

const SLUG = "butterfly-house";

function makeGetRequest(slug?: string) {
  const headers: Record<string, string> = {};
  if (slug) headers["x-tenant-slug"] = slug;
  return new NextRequest("http://localhost/api/tenant/news", { headers });
}

function makePostRequest(body: Record<string, unknown>, slug?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (slug) headers["x-tenant-slug"] = slug;
  return new NextRequest("http://localhost/api/tenant/news", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: Record<string, unknown>, slug?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (slug) headers["x-tenant-slug"] = slug;
  return new NextRequest(`http://localhost/api/tenant/news/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string, slug?: string) {
  const headers: Record<string, string> = {};
  if (slug) headers["x-tenant-slug"] = slug;
  return new NextRequest(`http://localhost/api/tenant/news/${id}`, {
    method: "DELETE",
    headers,
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const sampleNews = {
  id: 1,
  institution_id: 1,
  title: "Butterfly Season Opens",
  content: "Come visit us this spring!",
  image_url: null,
  is_active: true,
  show_on_homepage: false,
  created_at: new Date("2026-03-01T00:00:00.000Z"),
  updated_at: new Date("2026-03-01T00:00:00.000Z"),
};

describe("News API", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // -----------------------------------------------------------------------
  // GET /api/tenant/news
  // -----------------------------------------------------------------------

  describe("GET /api/tenant/news", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await getNews(makeGetRequest()))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockGetTenantNews.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await getNews(makeGetRequest(SLUG)))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when user cannot manage institution profile", async () => {
      mockGetTenantNews.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await getNews(makeGetRequest(SLUG)))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when institution not found", async () => {
      mockGetTenantNews.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await getNews(makeGetRequest(SLUG)))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 200 with news list and calls service with slug", async () => {
      mockGetTenantNews.mockResolvedValueOnce([sampleNews]);

      const response = (await getNews(makeGetRequest(SLUG)))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body.news)).toBe(true);
      expect(body.news).toHaveLength(1);
      expect(body.news[0].title).toBe("Butterfly Season Opens");
      expect(mockGetTenantNews).toHaveBeenCalledWith({ slug: SLUG });
    });

    it("returns 200 with empty array when no news entries exist", async () => {
      mockGetTenantNews.mockResolvedValueOnce([]);

      const response = (await getNews(makeGetRequest(SLUG)))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.news).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/tenant/news
  // -----------------------------------------------------------------------

  describe("POST /api/tenant/news", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await postNews(makePostRequest({ title: "Test", content: "Body" })))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockCreateTenantNews.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await postNews(makePostRequest({ title: "Test", content: "Body" }, SLUG)))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when user cannot manage institution profile", async () => {
      mockCreateTenantNews.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await postNews(makePostRequest({ title: "Test", content: "Body" }, SLUG)))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 400 when title is missing", async () => {
      const response = (await postNews(makePostRequest({ content: "No title here" }, SLUG)))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 when content is missing", async () => {
      const response = (await postNews(makePostRequest({ title: "Title Only" }, SLUG)))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for unexpected fields in body (institutionId rejected by .strict())", async () => {
      const response = (await postNews(
        makePostRequest({ title: "Test", content: "Body", institutionId: 5 }, SLUG),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 201 and creates news entry on valid body", async () => {
      mockCreateTenantNews.mockResolvedValueOnce(sampleNews);

      const response = (await postNews(
        makePostRequest(
          { title: "Butterfly Season Opens", content: "Come visit us this spring!" },
          SLUG,
        ),
      ))!;
      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.news.title).toBe("Butterfly Season Opens");
      expect(mockCreateTenantNews).toHaveBeenCalledWith(
        expect.objectContaining({ slug: SLUG, title: "Butterfly Season Opens" }),
      );
    });

    it("allows is_active to be set to false on creation", async () => {
      mockCreateTenantNews.mockResolvedValueOnce({ ...sampleNews, is_active: false });

      const response = (await postNews(
        makePostRequest({ title: "Draft", content: "Not live yet", is_active: false }, SLUG),
      ))!;
      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.news.is_active).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/tenant/news/[id]
  // -----------------------------------------------------------------------

  describe("PATCH /api/tenant/news/[id]", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await patchNews(
        makePatchRequest("1", { title: "New Title" }),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid id parameter", async () => {
      const response = (await patchNews(
        makePatchRequest("abc", { title: "X" }, SLUG),
        routeContext("abc"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 when body has no updatable fields", async () => {
      const response = (await patchNews(makePatchRequest("1", {}, SLUG), routeContext("1")))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for unexpected fields in body (institutionId rejected by .strict())", async () => {
      const response = (await patchNews(
        makePatchRequest("1", { title: "X", institutionId: 5 }, SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockUpdateTenantNewsEntry.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await patchNews(
        makePatchRequest("1", { title: "New Title" }, SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when user cannot manage institution profile", async () => {
      mockUpdateTenantNewsEntry.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await patchNews(
        makePatchRequest("1", { title: "New Title" }, SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when news entry does not exist", async () => {
      mockUpdateTenantNewsEntry.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await patchNews(
        makePatchRequest("99", { title: "X" }, SLUG),
        routeContext("99"),
      ))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("updates and returns the news entry and calls service with slug", async () => {
      mockUpdateTenantNewsEntry.mockResolvedValueOnce({ ...sampleNews, title: "Updated Title" });

      const response = (await patchNews(
        makePatchRequest("1", { title: "Updated Title" }, SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.news.title).toBe("Updated Title");
      expect(mockUpdateTenantNewsEntry).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, slug: SLUG, title: "Updated Title" }),
      );
    });

    it("allows selecting an active entry for the homepage", async () => {
      mockUpdateTenantNewsEntry.mockResolvedValueOnce({
        ...sampleNews,
        show_on_homepage: true,
      });

      const response = (await patchNews(
        makePatchRequest("1", { show_on_homepage: true }, SLUG),
        routeContext("1"),
      ))!;

      expect(response.status).toBe(200);
      expect((await response.json()).news.show_on_homepage).toBe(true);
      expect(mockUpdateTenantNewsEntry).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, slug: SLUG, show_on_homepage: true }),
      );
    });

    it("returns conflict when attempting to select an inactive entry", async () => {
      mockUpdateTenantNewsEntry.mockRejectedValueOnce(new Error("CONFLICT"));

      const response = (await patchNews(
        makePatchRequest("1", { show_on_homepage: true }, SLUG),
        routeContext("1"),
      ))!;

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("CONFLICT");
    });

    it("can toggle is_active independently", async () => {
      mockUpdateTenantNewsEntry.mockResolvedValueOnce({ ...sampleNews, is_active: false });

      const response = (await patchNews(
        makePatchRequest("1", { is_active: false }, SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);
      expect(mockUpdateTenantNewsEntry).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, slug: SLUG, is_active: false }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/tenant/news/[id]
  // -----------------------------------------------------------------------

  describe("DELETE /api/tenant/news/[id]", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await deleteNews(makeDeleteRequest("1"), routeContext("1")))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid id parameter", async () => {
      const response = (await deleteNews(makeDeleteRequest("abc", SLUG), routeContext("abc")))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockDeleteTenantNewsEntry.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await deleteNews(makeDeleteRequest("1", SLUG), routeContext("1")))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when user cannot manage institution profile", async () => {
      mockDeleteTenantNewsEntry.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await deleteNews(makeDeleteRequest("1", SLUG), routeContext("1")))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when news entry does not exist", async () => {
      mockDeleteTenantNewsEntry.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await deleteNews(makeDeleteRequest("99", SLUG), routeContext("99")))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 200 with deleted: true on success and calls service with slug", async () => {
      mockDeleteTenantNewsEntry.mockResolvedValueOnce(sampleNews);

      const response = (await deleteNews(makeDeleteRequest("1", SLUG), routeContext("1")))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.deleted).toBe(true);
      expect(mockDeleteTenantNewsEntry).toHaveBeenCalledWith({ id: 1, slug: SLUG });
    });
  });
});
