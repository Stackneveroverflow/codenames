import { describe, expect, it } from "vitest";

import { createBoard, createClassicOwnerLayout, createInitialTurn, determineWinner, endTurn, guessCard, submitClue } from "../src/index";

const contents = Array.from({ length: 25 }, (_, index) => ({
  type: "word" as const,
  text: `词语${index + 1}`,
}));

describe("game-core", () => {
  it("creates a classic owner layout with a starter advantage", () => {
    const owners = createClassicOwnerLayout("red");
    expect(owners.filter((owner) => owner === "red")).toHaveLength(9);
    expect(owners.filter((owner) => owner === "blue")).toHaveLength(8);
    expect(owners.filter((owner) => owner === "neutral")).toHaveLength(7);
    expect(owners.filter((owner) => owner === "assassin")).toHaveLength(1);
  });

  it("submits a clue and counts guesses", () => {
    const initial = createInitialTurn("red");
    const turn = submitClue(initial, "p1", "海洋", 2);

    expect(turn.phase).toBe("guess");
    expect(turn.clue?.clue).toBe("海洋");
    expect(turn.clue?.guessesRemaining).toBe(3);
  });

  it("switches turn after a wrong guess", () => {
    const board = createBoard(contents, "red", () => 0.1).map((card, index) =>
      index === 0 ? { ...card, owner: "blue" as const } : card,
    );
    const round = {
      board,
      turn: submitClue(createInitialTurn("red"), "p1", "天空", 1),
      winner: null,
    };

    const outcome = guessCard(round, "card-1");
    expect(outcome.shouldEndTurn).toBe(true);
    expect(outcome.nextTurn.team).toBe("blue");
    expect(outcome.nextTurn.phase).toBe("clue");
  });

  it("ends the game on assassin", () => {
    const board = createBoard(contents, "red", () => 0.2).map((card, index) =>
      index === 4 ? { ...card, owner: "assassin" as const } : card,
    );
    const round = {
      board,
      turn: submitClue(createInitialTurn("red"), "p1", "危险", 1),
      winner: null,
    };

    const outcome = guessCard(round, "card-5");
    expect(outcome.winner?.reason).toBe("assassin");
  });

  it("determines winner when all blue cards are revealed", () => {
    const board = createBoard(contents, "blue", () => 0.3).map((card) =>
      card.owner === "blue" ? { ...card, revealed: true } : card,
    );

    expect(determineWinner(board, null)).toEqual({ team: "blue", reason: "all_found" });
  });

  it("explicitly ends turn after guesses", () => {
    const turn = submitClue(createInitialTurn("blue"), "p2", "交通", 2);
    const next = endTurn(turn);
    expect(next.team).toBe("red");
    expect(next.phase).toBe("clue");
  });
});
