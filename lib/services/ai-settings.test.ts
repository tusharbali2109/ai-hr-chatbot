import { describe, expect, it } from "vitest";
import { parseKeyList } from "./ai-settings";

describe("parseKeyList", () => {
  it("returns [] for null / empty / whitespace", () => {
    expect(parseKeyList(null)).toEqual([]);
    expect(parseKeyList(undefined)).toEqual([]);
    expect(parseKeyList("   \n  ")).toEqual([]);
  });

  it("splits on newlines, commas, semicolons and whitespace", () => {
    expect(parseKeyList("AQ.one\nAQ.two")).toEqual(["AQ.one", "AQ.two"]);
    expect(parseKeyList("AQ.one, AQ.two ; AQ.three")).toEqual(["AQ.one", "AQ.two", "AQ.three"]);
    expect(parseKeyList("  AQ.one   AQ.two  ")).toEqual(["AQ.one", "AQ.two"]);
  });

  it("de-duplicates while preserving order", () => {
    expect(parseKeyList("AQ.one\nAQ.two\nAQ.one")).toEqual(["AQ.one", "AQ.two"]);
  });
});
