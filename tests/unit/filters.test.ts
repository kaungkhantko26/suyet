import { describe, expect, it } from "vitest";
import { countActiveFilters, filtersToSearchParams, parseEventFilters, setParam, toggleParam } from "@/lib/events/filters";

describe("parseEventFilters", () => {
  it("parses combined filters from the URL", () => {
    const f = parseEventFilters(new URLSearchParams("category=hackathons&category=ctf&format=online&fee=free&sort=deadline&page=3&q=ai"));
    expect(f).toMatchObject({ category: ["hackathons", "ctf"], format: ["ONLINE"], fee: "free", sort: "deadline", page: 3, q: "ai" });
  });
  it("accepts comma-separated multi values", () => {
    expect(parseEventFilters({ category: "a,b" }).category).toEqual(["a", "b"]);
  });
  it("drops invalid values instead of failing", () => {
    const f = parseEventFilters({ format: "teleport", fee: "maybe", sort: "random", page: "-4", category: "Bad Slug!", from: "yesterday" });
    expect(f).toMatchObject({ format: [], fee: undefined, sort: "upcoming", page: 1, category: [], from: undefined });
  });
  it("caps absurd page numbers and long queries", () => {
    expect(parseEventFilters({ page: "99999999" }).page).toBe(500);
    expect(parseEventFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("URL building keeps unrelated filters", () => {
  const cur = new URLSearchParams("category=hackathons&format=online&page=2&sort=newest");
  it("toggle adds a value and resets pagination only", () => {
    const n = toggleParam(cur, "category", "ctf");
    expect(n.getAll("category")).toEqual(["hackathons", "ctf"]);
    expect(n.get("format")).toBe("online");
    expect(n.get("sort")).toBe("newest");
    expect(n.has("page")).toBe(false);
  });
  it("toggle removes only the given value", () => {
    expect(toggleParam(cur, "category", "hackathons").has("category")).toBe(false);
  });
  it("setParam sets and clears single values", () => {
    expect(setParam(cur, "fee", "free").get("fee")).toBe("free");
    expect(setParam(setParam(cur, "fee", "free"), "fee", null).has("fee")).toBe(false);
  });
  it("round-trips through serialization with defaults omitted", () => {
    const f = parseEventFilters(cur);
    const again = parseEventFilters(filtersToSearchParams(f));
    expect(again).toEqual(f);
    expect(filtersToSearchParams(parseEventFilters({})).toString()).toBe("");
  });
  it("counts active filters", () => {
    expect(countActiveFilters(parseEventFilters({ category: "a,b", fee: "free", past: "1" }))).toBe(4);
  });
});
