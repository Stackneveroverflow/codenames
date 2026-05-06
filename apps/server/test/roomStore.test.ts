import { describe, expect, it } from "vitest";

import { createFallbackDeck } from "../src/deckService";
import { RoomStore } from "../src/roomStore";

describe("RoomStore", () => {
  it("creates room, joins players, and starts a game", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1");
    const joined = store.joinRoom(created.roomId, "乙", "socket-2");

    store.assignRole(created.roomId, created.playerId, created.playerId, "red_spymaster");
    store.assignRole(created.roomId, created.playerId, joined.playerId, "red_operatives");
    store.startGame(created.roomId, created.playerId, createFallbackDeck());

    const snapshot = store.snapshotFor(created.roomId, created.playerId);
    expect(snapshot.board).toHaveLength(25);
    expect(snapshot.phase).toBe("in_round");
  });

  it("stores the chosen room config at creation", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1", { gameMode: "image", teamSize: 5 });
    const snapshot = store.snapshotFor(created.roomId, created.playerId);

    expect(snapshot.config.gameMode).toBe("image");
    expect(snapshot.config.teamSize).toBe(5);
  });

  it("rejects team assignments above the configured team size", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1", { teamSize: 2 });
    const first = store.joinRoom(created.roomId, "乙", "socket-2");
    const third = store.joinRoom(created.roomId, "丙", "socket-3");

    store.assignRole(created.roomId, created.playerId, created.playerId, "red_spymaster");
    store.assignRole(created.roomId, created.playerId, first.playerId, "red_operatives");

    expect(() => store.assignRole(created.roomId, created.playerId, third.playerId, "red_operatives")).toThrow("每队最多 2 人");
  });

  it("restores player connection by player id", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1");
    store.disconnect("socket-1");

    const restored = store.rejoinRoom(created.roomId, created.playerId, "socket-1b");
    expect(restored.selfId).toBe(created.playerId);
  });

  it("transfers host to earliest online player on disconnect", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1");
    const joined = store.joinRoom(created.roomId, "乙", "socket-2");

    store.disconnect("socket-1");
    const snapshot = store.snapshotFor(created.roomId, joined.playerId);
    expect(snapshot.hostId).toBe(joined.playerId);
  });

  it("rejects unauthorized turn actions", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1");
    const operative = store.joinRoom(created.roomId, "乙", "socket-2");

    store.assignRole(created.roomId, created.playerId, created.playerId, "red_spymaster");
    store.assignRole(created.roomId, created.playerId, operative.playerId, "red_operatives");
    store.startGame(created.roomId, created.playerId, createFallbackDeck());

    expect(() => store.submitClue(created.roomId, operative.playerId, "海洋", 1)).toThrow();
  });
});
