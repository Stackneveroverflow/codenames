import type { CardContent, CardOwner, CardState, ClueState, TeamName, TurnState, WinnerState } from "@codenames/shared";

export interface RoundState {
  board: CardState[];
  turn: TurnState;
  winner: WinnerState | null;
}

export interface GuessOutcome {
  card: CardState;
  nextTurn: TurnState;
  winner: WinnerState | null;
  shouldEndTurn: boolean;
}

export function createClassicOwnerLayout(startingTeam: TeamName): CardOwner[] {
  const friendlyCount = startingTeam === "red" ? 9 : 8;
  const enemyCount = startingTeam === "blue" ? 9 : 8;
  const owners: CardOwner[] = [
    ...Array.from({ length: friendlyCount }, () => "red" as const),
    ...Array.from({ length: enemyCount }, () => "blue" as const),
    ...Array.from({ length: 7 }, () => "neutral" as const),
    "assassin",
  ];
  return owners;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function createBoard(contents: CardContent[], startingTeam: TeamName, random = Math.random): CardState[] {
  if (contents.length !== 25) {
    throw new Error("Classic board requires 25 cards");
  }

  const owners = shuffle(createClassicOwnerLayout(startingTeam), random);
  return contents.map((content, index) => ({
    id: `card-${index + 1}`,
    content,
    owner: owners[index]!,
    revealed: false,
  }));
}

export function createInitialTurn(team: TeamName): TurnState {
  return {
    team,
    clue: null,
    phase: "clue",
  };
}

export function submitClue(turn: TurnState, byPlayerId: string, clue: string, count: number): TurnState {
  if (turn.phase !== "clue") {
    throw new Error("Clue phase already completed");
  }

  const clueState: ClueState = {
    byPlayerId,
    clue,
    count,
    guessesRemaining: count + 1,
  };

  return {
    ...turn,
    clue: clueState,
    phase: "guess",
  };
}

export function countRemaining(board: CardState[], team: TeamName): number {
  return board.filter((card) => !card.revealed && card.owner === team).length;
}

export function determineWinner(board: CardState[], guessedOwner: CardOwner | null): WinnerState | null {
  if (countRemaining(board, "red") === 0) {
    return { team: "red", reason: "all_found" };
  }

  if (countRemaining(board, "blue") === 0) {
    return { team: "blue", reason: "all_found" };
  }

  return null;
}

export function oppositeTeam(team: TeamName): TeamName {
  return team === "red" ? "blue" : "red";
}

export function revealCard(board: CardState[], cardId: string): CardState[] {
  let found = false;
  const nextBoard = board.map((card) => {
    if (card.id !== cardId) {
      return card;
    }

    if (card.revealed) {
      throw new Error("Card already revealed");
    }

    found = true;
    return { ...card, revealed: true };
  });

  if (!found) {
    throw new Error("Card not found");
  }

  return nextBoard;
}

export function guessCard(state: RoundState, cardId: string): GuessOutcome {
  if (state.turn.phase !== "guess" || !state.turn.clue) {
    throw new Error("Guess phase not active");
  }

  const board = revealCard(state.board, cardId);
  const card = board.find((entry) => entry.id === cardId)!;
  if (card.owner === "assassin") {
    return {
      card,
      nextTurn: state.turn,
      winner: { team: oppositeTeam(state.turn.team), reason: "assassin" },
      shouldEndTurn: true,
    };
  }

  const winner = determineWinner(board, card.owner);

  if (winner) {
    return {
      card,
      nextTurn: state.turn,
      winner,
      shouldEndTurn: true,
    };
  }

  const guessedFriendly = card.owner === state.turn.team;
  const guessesRemaining = guessedFriendly ? state.turn.clue.guessesRemaining - 1 : 0;
  const shouldEndTurn = !guessedFriendly || guessesRemaining <= 0;
  const nextTurn: TurnState = shouldEndTurn
    ? createInitialTurn(oppositeTeam(state.turn.team))
    : {
        ...state.turn,
        clue: {
          ...state.turn.clue,
          guessesRemaining,
        },
      };

  return {
    card,
    nextTurn,
    winner: null,
    shouldEndTurn,
  };
}

export function endTurn(turn: TurnState): TurnState {
  if (turn.phase !== "guess") {
    throw new Error("Cannot end turn before clue");
  }

  return createInitialTurn(oppositeTeam(turn.team));
}
