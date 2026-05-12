import { describe, expect, it } from "vitest";

import { applyGuess, assignTeams, boardCardCount, createDeal, createInitialTurn, createOwnerLayout, endTurn, submitClue } from "../src/index";

const textContents = Array.from({ length: 25 }, (_, index) => ({
  type: "word" as const,
  text: `词语${index + 1}`,
}));

const imageContents = Array.from({ length: 25 }, (_, index) => ({
  type: "image" as const,
  imageUrl: `/image-card-${index + 1}.svg`,
  alt: `图片${index + 1}`,
}));

describe("game-core dealer", () => {
  it("creates a 25-card text key with standard distribution", () => {
    const owners = createOwnerLayout("text", "red");
    expect(owners.filter((owner) => owner === "red")).toHaveLength(9);
    expect(owners.filter((owner) => owner === "blue")).toHaveLength(8);
    expect(owners.filter((owner) => owner === "neutral")).toHaveLength(7);
    expect(owners.filter((owner) => owner === "assassin")).toHaveLength(1);
  });

  it("creates a 25-card image key with standard distribution", () => {
    const owners = createOwnerLayout("image", "blue");
    expect(owners.filter((owner) => owner === "red")).toHaveLength(8);
    expect(owners.filter((owner) => owner === "blue")).toHaveLength(9);
    expect(owners.filter((owner) => owner === "neutral")).toHaveLength(7);
    expect(owners.filter((owner) => owner === "assassin")).toHaveLength(1);
  });

  it("deals public text cards and a separate key grid", () => {
    const deal = createDeal(textContents, "text", "red", () => 0.2);
    expect(deal.board).toHaveLength(25);
    expect(deal.keyGrid).toHaveLength(25);
    expect(deal.board[0]).not.toHaveProperty("owner");
    expect(deal.keyGrid[0]?.cardId).toBe("card-1");
  });

  it("deals public image placeholders", () => {
    const deal = createDeal(imageContents, "image", "blue", () => 0.6);
    expect(deal.board).toHaveLength(25);
    expect(deal.keyGrid).toHaveLength(25);
    expect(deal.board[0]?.content.type).toBe("image");
  });

  it("rejects a board with the wrong card count", () => {
    expect(() => createDeal(textContents.slice(0, 20), "text", "red")).toThrow("Text board requires 25 cards");
  });

  it("reports board sizes by mode", () => {
    expect(boardCardCount("text")).toBe(25);
    expect(boardCardCount("image")).toBe(25);
  });
});

describe("game-core team and turn rules", () => {
  const teams = {
    red: { spymasterId: "red-boss", operativeIds: ["red-1"] },
    blue: { spymasterId: "blue-boss", operativeIds: ["blue-1"] },
  };

  it("assigns balanced teams with one spymaster per team", () => {
    const teams = assignTeams(["p1", "p2", "p3", "p4", "p5"], () => 0);
    const redCount = 1 + teams.red.operativeIds.length;
    const blueCount = 1 + teams.blue.operativeIds.length;

    expect(Math.abs(redCount - blueCount)).toBeLessThanOrEqual(1);
    expect(teams.red.spymasterId).toBeTruthy();
    expect(teams.blue.spymasterId).toBeTruthy();
    expect(teams.red.operativeIds).toHaveLength(redCount - 1);
    expect(teams.blue.operativeIds).toHaveLength(blueCount - 1);
  });

  it("rotates the active operative by team order", () => {
    const teams = {
      red: { spymasterId: "red-boss", operativeIds: ["red-1", "red-2"] },
      blue: { spymasterId: "blue-boss", operativeIds: ["blue-1"] },
    };
    const deal = createDeal(textContents, "text", "red", () => 0);
    const initial = createInitialTurn("red", teams, deal.keyGrid, deal.board);
    const first = submitClue(initial, teams, "水", 1);
    const secondClue = { ...initial, nextOperativeIndex: first.nextOperativeIndex };
    const second = submitClue(secondClue, teams, "火", 1);

    expect(first.activePlayerId).toBe("red-1");
    expect(second.activePlayerId).toBe("red-2");
  });

  it("rejects clue counts below zero", () => {
    const deal = createDeal(textContents, "text", "red", () => 0);
    const initial = createInitialTurn("red", teams, deal.keyGrid, deal.board);

    expect(() => submitClue(initial, teams, "线", -1)).toThrow("线索数量不能小于0");
  });

  it("rejects clue counts above the current team's remaining cards", () => {
    const board = [
      { id: "card-1", content: textContents[0]! },
      { id: "card-2", content: textContents[1]! },
    ];
    const keyGrid = [
      { cardId: "card-1", owner: "red" as const },
      { cardId: "card-2", owner: "blue" as const },
    ];
    const initial = createInitialTurn("red", teams, keyGrid, board);

    expect(() => submitClue(initial, teams, "线", 2)).toThrow("线索数量不能大于己方剩余牌数");
  });

  it("reveals own cards, decrements remaining cards, and keeps guessing", () => {
    const teams = {
      red: { spymasterId: "red-boss", operativeIds: ["red-1"] },
      blue: { spymasterId: "blue-boss", operativeIds: ["blue-1"] },
    };
    const board = [
      { id: "card-1", content: textContents[0]! },
      { id: "card-2", content: textContents[1]! },
    ];
    const keyGrid = [
      { cardId: "card-1", owner: "red" as const },
      { cardId: "card-2", owner: "blue" as const },
    ];
    const turn = submitClue(createInitialTurn("red", teams, keyGrid, board), teams, "线", 1);
    const result = applyGuess(board, keyGrid, turn, teams, "card-1");

    expect(result.board[0]?.revealedOwner).toBe("red");
    expect(result.turn.remainingByTeam.red).toBe(0);
    expect(result.turn.result?.winner).toBe("red");
  });

  it("passes turn on a wrong guess and assassin gives the opponent victory", () => {
    const teams = {
      red: { spymasterId: "red-boss", operativeIds: ["red-1"] },
      blue: { spymasterId: "blue-boss", operativeIds: ["blue-1"] },
    };
    const board = [
      { id: "card-1", content: textContents[0]! },
      { id: "card-2", content: textContents[1]! },
    ];
    const wrongKey = [
      { cardId: "card-1", owner: "neutral" as const },
      { cardId: "card-2", owner: "assassin" as const },
    ];
    const turn = submitClue(createInitialTurn("red", teams, wrongKey, board), teams, "线", 0);
    const wrong = applyGuess(board, wrongKey, turn, teams, "card-1");
    const assassin = applyGuess(board, wrongKey, turn, teams, "card-2");

    expect(wrong.turn.currentTeam).toBe("blue");
    expect(wrong.turn.phase).toBe("clue");
    expect(assassin.turn.result).toEqual({ winner: "blue", reason: "assassin" });
  });

  it("limits guesses to clue count plus one", () => {
    const teams = {
      red: { spymasterId: "red-boss", operativeIds: ["red-1"] },
      blue: { spymasterId: "blue-boss", operativeIds: ["blue-1"] },
    };
    const deal = createDeal(textContents, "text", "red", () => 0);
    const turn = submitClue(createInitialTurn("red", teams, deal.keyGrid, deal.board), teams, "线", 3);

    expect(turn.remainingGuesses).toBe(4);
  });

  it("sets a 90 second deadline for the initial clue phase", () => {
    const deal = createDeal(textContents, "text", "red", () => 0);
    const turn = createInitialTurn("red", teams, deal.keyGrid, deal.board, "2026-01-01T00:00:00.000Z");

    expect(turn.phaseStartedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(turn.deadlineAt).toBe("2026-01-01T00:01:30.000Z");
  });

  it("sets a 180 second deadline after a clue is submitted", () => {
    const deal = createDeal(textContents, "text", "red", () => 0);
    const initial = createInitialTurn("red", teams, deal.keyGrid, deal.board, "2026-01-01T00:00:00.000Z");
    const turn = submitClue(initial, teams, "线", 2, "2026-01-01T00:02:00.000Z");

    expect(turn.phase).toBe("guess");
    expect(turn.phaseStartedAt).toBe("2026-01-01T00:02:00.000Z");
    expect(turn.deadlineAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("resets the clue deadline after ending a turn or making a wrong guess", () => {
    const board = [
      { id: "card-1", content: textContents[0]! },
      { id: "card-2", content: textContents[1]! },
    ];
    const keyGrid = [
      { cardId: "card-1", owner: "neutral" as const },
      { cardId: "card-2", owner: "blue" as const },
    ];
    const guessingTurn = submitClue(createInitialTurn("red", teams, keyGrid, board, "2026-01-01T00:00:00.000Z"), teams, "线", 0, "2026-01-01T00:02:00.000Z");
    const endedTurn = endTurn(guessingTurn, teams, "2026-01-01T00:03:00.000Z");
    const wrongGuess = applyGuess(board, keyGrid, guessingTurn, teams, "card-1", "2026-01-01T00:04:00.000Z");

    expect(endedTurn.phase).toBe("clue");
    expect(endedTurn.deadlineAt).toBe("2026-01-01T00:04:30.000Z");
    expect(wrongGuess.turn.phase).toBe("clue");
    expect(wrongGuess.turn.deadlineAt).toBe("2026-01-01T00:05:30.000Z");
  });

  it("clears the active deadline when the game ends", () => {
    const board = [
      { id: "card-1", content: textContents[0]! },
      { id: "card-2", content: textContents[1]! },
    ];
    const keyGrid = [
      { cardId: "card-1", owner: "assassin" as const },
      { cardId: "card-2", owner: "blue" as const },
    ];
    const turn = submitClue(createInitialTurn("red", teams, keyGrid, board), teams, "线", 0);
    const result = applyGuess(board, keyGrid, turn, teams, "card-1", "2026-01-01T00:05:00.000Z");

    expect(result.turn.phase).toBe("ended");
    expect(result.turn.deadlineAt).toBeNull();
  });
});
