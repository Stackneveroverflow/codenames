import { afterEach, describe, expect, it, vi } from "vitest";

import { createFallbackDeck } from "../src/deckService";
import { RoomStore } from "../src/roomStore";

function createFourPlayerRoom(store: RoomStore) {
  const created = store.createRoom("甲", "socket-1");
  const second = store.joinRoom(created.roomId, "乙", "socket-2");
  const third = store.joinRoom(created.roomId, "丙", "socket-3");
  const fourth = store.joinRoom(created.roomId, "丁", "socket-4");
  return { created, second, third, fourth };
}

describe("RoomStore dealer flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates room, joins players, and deals text cards", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);

    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));

    const snapshot = store.snapshotFor(created.roomId, created.playerId);
    const captain = snapshot.players.find((player) => player.role === "red_spymaster" || player.role === "blue_spymaster")!;
    expect(snapshot.board).toHaveLength(25);
    expect(store.snapshotFor(created.roomId, captain.id).keyGrid).toHaveLength(25);
    expect(snapshot.phase).toBe("dealt");
  });

  it("stores the chosen room config at creation", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1", { gameMode: "image", teamSize: 10 });
    const snapshot = store.snapshotFor(created.roomId, created.playerId);

    expect(snapshot.config.gameMode).toBe("image");
    expect(snapshot.config.teamSize).toBe(10);
  });

  it("stores host AI config privately without exposing the API key in snapshots", () => {
    const store = new RoomStore();
    const created = store.createRoom(
      "甲",
      "socket-1",
      { gameMode: "text", teamSize: 4 },
      {
        provider: "openai",
        apiKey: "sk-private-room-key",
        textModel: "gpt-5.4-mini",
        imageModel: "gpt-image-1.5",
      },
    );

    expect(store.getAiConfig(created.roomId)).toEqual({
      provider: "openai",
      apiKey: "sk-private-room-key",
      textModel: "gpt-5.4-mini",
      imageModel: "gpt-image-1.5",
    });
    expect(JSON.stringify(created.snapshot)).not.toContain("sk-private-room-key");
    expect(JSON.stringify(store.snapshotFor(created.roomId, created.playerId))).not.toContain("sk-private-room-key");
  });

  it("deals image mode as a 25-card board", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1", { gameMode: "image" });
    store.joinRoom(created.roomId, "乙", "socket-2");
    store.joinRoom(created.roomId, "丙", "socket-3");
    store.joinRoom(created.roomId, "丁", "socket-4");

    store.startGame(created.roomId, created.playerId, createFallbackDeck("image"));

    const snapshot = store.snapshotFor(created.roomId, created.playerId);
    const captain = snapshot.players.find((player) => player.role === "red_spymaster" || player.role === "blue_spymaster")!;
    expect(snapshot.board).toHaveLength(25);
    expect(store.snapshotFor(created.roomId, captain.id).keyGrid).toHaveLength(25);
    expect(snapshot.board?.[0]?.content.type).toBe("image");
  });

  it("does not overwrite rooms when generated room codes collide", () => {
    const store = new RoomStore();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2);

    const first = store.createRoom("甲", "socket-1");
    const second = store.createRoom("乙", "socket-2");

    expect(second.roomId).not.toBe(first.roomId);
    expect(store.snapshotFor(first.roomId, first.playerId).players[0]?.nickname).toBe("甲");
    expect(store.snapshotFor(second.roomId, second.playerId).players[0]?.nickname).toBe("乙");
  });

  it("hides the key grid from ordinary players", () => {
    const store = new RoomStore();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { created } = createFourPlayerRoom(store);

    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));

    const hostSnapshot = store.snapshotFor(created.roomId, created.playerId);
    const ordinary = hostSnapshot.players.find((player) => player.role === "red_operatives" || player.role === "blue_operatives");
    expect(hostSnapshot.selfRole).toBe("blue_operatives");
    expect(hostSnapshot.keyGrid).toBeUndefined();
    expect(ordinary).toBeTruthy();
    expect(store.snapshotFor(created.roomId, ordinary!.id).keyGrid).toBeUndefined();
  });

  it("shows the key grid to captains", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);

    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));

    const roomSnapshot = store.snapshotFor(created.roomId, created.playerId);
    const captain = roomSnapshot.players.find((player) => player.role === "red_spymaster" || player.role === "blue_spymaster");
    expect(captain).toBeTruthy();
    const snapshot = store.snapshotFor(created.roomId, captain!.id);
    expect(snapshot.keyGrid).toHaveLength(25);
  });

  it("redeals a fresh key on restart", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);

    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));
    const firstCaptain = store.snapshotFor(created.roomId, created.playerId).players.find((player) => player.role === "red_spymaster" || player.role === "blue_spymaster")!;
    const first = store.snapshotFor(created.roomId, firstCaptain.id).keyGrid?.map((cell) => cell.owner).join(",");
    store.restart(created.roomId, created.playerId, createFallbackDeck("text"));
    const secondCaptain = store.snapshotFor(created.roomId, created.playerId).players.find((player) => player.role === "red_spymaster" || player.role === "blue_spymaster")!;
    const second = store.snapshotFor(created.roomId, secondCaptain.id).keyGrid?.map((cell) => cell.owner).join(",");

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
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

  it("allows only the active spymaster to submit a clue", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);
    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));
    const snapshot = store.snapshotFor(created.roomId, created.playerId);
    const activeSpymaster = snapshot.turn!.activePlayerId!;
    const otherPlayer = snapshot.players.find((player) => player.id !== activeSpymaster)!;

    expect(() => store.submitClue(created.roomId, otherPlayer.id, "Ω", 2)).toThrow("只有当前队长可以提交线索");
    store.submitClue(created.roomId, activeSpymaster, "Ω", 2);

    const next = store.snapshotFor(created.roomId, activeSpymaster);
    expect(next.turn?.phase).toBe("guess");
    expect(next.turn?.clue).toEqual({ text: "Ω", count: 2 });
    expect(next.turn?.remainingGuesses).toBe(3);
  });

  it("rejects clues that contain any board word character", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);
    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));
    const snapshot = store.snapshotFor(created.roomId, created.playerId);
    const activeSpymaster = snapshot.turn!.activePlayerId!;
    const boardText = snapshot.board![0]!.content.type === "word" ? snapshot.board![0]!.content.text : "";
    const boardChar = [...boardText].find((char) => char.trim())!;

    expect(() => store.submitClue(created.roomId, activeSpymaster, `${boardChar}风`, 2)).toThrow(`线索不能包含牌阵中出现的字：${boardChar}，请重新输入`);

    store.submitClue(created.roomId, activeSpymaster, "Ω", 2);
    const next = store.snapshotFor(created.roomId, activeSpymaster);
    expect(next.turn?.phase).toBe("guess");
  });

  it("does not reject image clues based on image alt text", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);
    store.updateConfig(created.roomId, created.playerId, { gameMode: "image" });
    store.startGame(created.roomId, created.playerId, createFallbackDeck("image"));
    const snapshot = store.snapshotFor(created.roomId, created.playerId);
    const activeSpymaster = snapshot.turn!.activePlayerId!;
    const alt = snapshot.board![0]!.content.type === "image" ? snapshot.board![0]!.content.alt : "";

    store.submitClue(created.roomId, activeSpymaster, `${alt}线索`, 1);
    const next = store.snapshotFor(created.roomId, activeSpymaster);
    expect(next.turn?.phase).toBe("guess");
  });

  it("allows only the active operative to guess and end turns", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);
    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));
    const initial = store.snapshotFor(created.roomId, created.playerId);
    store.submitClue(created.roomId, initial.turn!.activePlayerId!, "Ω", 1);
    const guessing = store.snapshotFor(created.roomId, created.playerId);
    const activeOperative = guessing.turn!.activePlayerId!;
    const otherPlayer = guessing.players.find((player) => player.id !== activeOperative)!;

    expect(() => store.guessCard(created.roomId, otherPlayer.id, guessing.board![0]!.id)).toThrow("只有当前猜词队员可以猜牌");
    store.endTurn(created.roomId, activeOperative);

    const next = store.snapshotFor(created.roomId, created.playerId);
    expect(next.turn?.phase).toBe("clue");
    expect(next.turn?.currentTeam).not.toBe(guessing.turn?.currentTeam);
  });

  it("includes team, turn, revealed card, and result state in snapshots", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);
    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));
    const initial = store.snapshotFor(created.roomId, created.playerId);
    store.submitClue(created.roomId, initial.turn!.activePlayerId!, "Ω", 1);
    const guessing = store.snapshotFor(created.roomId, created.playerId);
    store.guessCard(created.roomId, guessing.turn!.activePlayerId!, guessing.board![0]!.id);

    const snapshot = store.snapshotFor(created.roomId, created.playerId);
    expect(snapshot.teams).toBeTruthy();
    expect(snapshot.turn).toBeTruthy();
    expect(snapshot.board?.[0]?.revealedOwner).toBeTruthy();
    expect(snapshot.turn?.remainingByTeam.red).toBeGreaterThanOrEqual(0);
    expect(snapshot.turn?.remainingByTeam.blue).toBeGreaterThanOrEqual(0);
  });

  it("keeps spectators out of team assignment and key-grid access", () => {
    const store = new RoomStore();
    const created = store.createRoom("甲", "socket-1");
    const second = store.joinRoom(created.roomId, "乙", "socket-2");
    const third = store.joinRoom(created.roomId, "丙", "socket-3");
    const fourth = store.joinRoom(created.roomId, "丁", "socket-4");
    const fifth = store.joinRoom(created.roomId, "戊", "socket-5");

    store.setSpectatorIntent(created.roomId, created.playerId, true);
    store.setSpectatorIntent(created.roomId, fifth.playerId, false);
    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));

    const hostSnapshot = store.snapshotFor(created.roomId, created.playerId);
    const teamIds = [
      hostSnapshot.teams!.red.spymasterId,
      ...hostSnapshot.teams!.red.operativeIds,
      hostSnapshot.teams!.blue.spymasterId,
      ...hostSnapshot.teams!.blue.operativeIds,
    ];
    expect(teamIds).toEqual(expect.arrayContaining([second.playerId, third.playerId, fourth.playerId, fifth.playerId]));
    expect(teamIds).not.toContain(created.playerId);
    expect(hostSnapshot.selfRole).toBe("spectator");
    expect(hostSnapshot.keyGrid).toBeUndefined();
  });

  it("requires enough non-spectator players before starting", () => {
    const store = new RoomStore();
    const { created, second } = createFourPlayerRoom(store);

    store.setSpectatorIntent(created.roomId, second.playerId, true);

    expect(() => store.startGame(created.roomId, created.playerId, createFallbackDeck("text"))).toThrow("需要 4 名参赛玩家才能开局");
  });

  it("returns a finished game to the lobby and preserves spectator queue choices", () => {
    const store = new RoomStore();
    const { created } = createFourPlayerRoom(store);
    const spectator = store.joinRoom(created.roomId, "戊", "socket-5");

    store.startGame(created.roomId, created.playerId, createFallbackDeck("text"));
    store.returnToLobby(created.roomId, created.playerId);

    const hostSnapshot = store.snapshotFor(created.roomId, created.playerId);
    const spectatorSnapshot = store.snapshotFor(created.roomId, spectator.playerId);
    expect(hostSnapshot.phase).toBe("lobby");
    expect(hostSnapshot.board).toBeNull();
    expect(hostSnapshot.keyGrid).toBeUndefined();
    expect(hostSnapshot.teams).toBeNull();
    expect(hostSnapshot.turn).toBeNull();
    expect(hostSnapshot.players.find((player) => player.id === spectator.playerId)?.spectatorIntent).toBe(true);
    expect(spectatorSnapshot.selfRole).toBe("spectator");
  });
});
