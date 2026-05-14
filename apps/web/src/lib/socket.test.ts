import { describe, expect, it } from "vitest";

import { resolveServerUrlForLocation } from "./socket";

function locationFor(href: string) {
  return new URL(href) as unknown as Location;
}

describe("socket server URL resolution", () => {
  it("uses the page LAN host when the configured server URL is localhost", () => {
    expect(resolveServerUrlForLocation("http://localhost:3001", locationFor("http://192.168.1.20:5173/room/ABCD"))).toBe("http://192.168.1.20:3001");
  });

  it("keeps localhost for the host machine", () => {
    expect(resolveServerUrlForLocation("http://localhost:3001", locationFor("http://127.0.0.1:5173/room/ABCD"))).toBe("http://localhost:3001");
  });

  it("defaults dev game pages to the same host on server port 3001", () => {
    expect(resolveServerUrlForLocation(undefined, locationFor("http://192.168.1.20:5173/room/ABCD"))).toBe("http://192.168.1.20:3001");
  });
});
