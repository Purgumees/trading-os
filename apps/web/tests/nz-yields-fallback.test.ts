import { afterEach, describe, expect, it, vi } from "vitest";
import { internationalYields } from "../src/lib/international-yields-server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RBNZ fallback yields", () => {
  it("excludes a stale snapshot from current comparisons when refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));

    const data = await internationalYields("nzd");

    expect(data.rows).toEqual([]);
    expect(data.error).toContain("snapshot is stale");
    expect(data.error).toContain("2026-10-08");
    expect(data.note).toContain("Snapshot excluded from current yield comparisons");
  });

  it("labels a recent verified snapshot as non-live when refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));

    const data = await internationalYields("nzd");

    expect(data.rows.at(-1)).toEqual({
      date: "2026-10-08",
      two: 3.85,
      ten: 5.11,
      thirty: null,
    });
    expect(data.error).toBeUndefined();
    expect(data.definition).toContain("snapshot");
    expect(data.note).toContain("Automatic refresh unavailable");
    expect(data.note).toContain("not a live feed");
  });
});
