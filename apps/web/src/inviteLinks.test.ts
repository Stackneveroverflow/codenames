import { describe, expect, it } from "vitest";

import { canCopyInviteLink, entryJoinUrl, type HostInfo } from "./inviteLinks";

const hostInfo: HostInfo = {
  port: 3210,
  localUrl: "http://localhost:3210",
  lanUrls: ["http://192.168.1.20:3210"],
};

describe("invite links", () => {
  it("keeps the dev entry app on port 5174", () => {
    expect(entryJoinUrl("ABCD", "http://127.0.0.1:5173/room/ABCD", hostInfo)).toBe("http://127.0.0.1:5174/?join=ABCD");
  });

  it("uses the LAN host in desktop host windows", () => {
    expect(entryJoinUrl("ABCD", "http://127.0.0.1:3210/room/ABCD", hostInfo)).toBe("http://192.168.1.20:3210/entry/?join=ABCD");
  });

  it("uses the current LAN origin when opened from another device", () => {
    expect(entryJoinUrl("ABCD", "http://192.168.1.20:3210/room/ABCD", null)).toBe("http://192.168.1.20:3210/entry/?join=ABCD");
  });

  it("blocks localhost desktop copies until LAN host info is available", () => {
    expect(canCopyInviteLink("http://127.0.0.1:3210/room/ABCD", null)).toBe(false);
    expect(canCopyInviteLink("http://127.0.0.1:3210/room/ABCD", hostInfo)).toBe(true);
  });
});
