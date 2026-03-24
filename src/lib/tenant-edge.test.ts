import { describe, expect, it } from "vitest";
import { getSubdomain } from "./tenant-edge";

describe("getSubdomain", () => {
  it("returns subdomain for multi-part host", () => {
    expect(getSubdomain("acme.app.com:3000")).toBe("acme");
  });

  it("returns null for localhost", () => {
    expect(getSubdomain("localhost:3000")).toBeNull();
  });

  it("returns null for www apex-style", () => {
    expect(getSubdomain("www.app.com")).toBeNull();
  });
});
