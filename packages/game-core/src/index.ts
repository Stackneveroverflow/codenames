import type {
  CardContent,
  CardOwner,
  GameMode,
  GameTeams,
  KeyCellState,
  PublicCardState,
  TeamName,
  TurnState,
} from "@codenames/shared";

export interface DealState {
  board: PublicCardState[];
  keyGrid: KeyCellState[];
  startingTeam: TeamName;
}

export function boardCardCount(mode: GameMode): number {
  return 25;
}

export function createOwnerLayout(_mode: GameMode, startingTeam: TeamName): CardOwner[] {
  const redCount = startingTeam === "red" ? 9 : 8;
  const blueCount = startingTeam === "blue" ? 9 : 8;
  return [
    ...Array.from({ length: redCount }, () => "red" as const),
    ...Array.from({ length: blueCount }, () => "blue" as const),
    ...Array.from({ length: 7 }, () => "neutral" as const),
    "assassin",
  ];
}

const cluePhaseDurationMs = 90 * 1000;
const guessPhaseDurationMs = 180 * 1000;

type TimeInput = Date | string;

function isoFromTime(time: TimeInput): string {
  return typeof time === "string" ? new Date(time).toISOString() : time.toISOString();
}

function phaseTimes(phase: TurnState["phase"], now: TimeInput = new Date()) {
  const phaseStartedAt = isoFromTime(now);
  const duration = phase === "clue" ? cluePhaseDurationMs : phase === "guess" ? guessPhaseDurationMs : null;
  return {
    phaseStartedAt,
    deadlineAt: duration === null ? null : new Date(new Date(phaseStartedAt).getTime() + duration).toISOString(),
  };
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function createDeal(contents: CardContent[], mode: GameMode, startingTeam: TeamName, random = Math.random): DealState {
  const expectedCount = boardCardCount(mode);
  if (contents.length !== expectedCount) {
    throw new Error(`${mode === "image" ? "Image" : "Text"} board requires ${expectedCount} cards`);
  }

  const owners = shuffle(createOwnerLayout(mode, startingTeam), random);
  const board = contents.map((content, index) => ({
    id: `card-${index + 1}`,
    content,
  }));

  return {
    board,
    keyGrid: board.map((card, index) => ({
      cardId: card.id,
      owner: owners[index]!,
    })),
    startingTeam,
  };
}

export function assignTeams(playerIds: string[], random = Math.random): GameTeams {
  if (playerIds.length < 4) {
    throw new Error("至少需要 4 名在线玩家才能开局");
  }

  const shuffled = shuffle(playerIds, random);
  const redSize = Math.ceil(shuffled.length / 2);
  const redPlayers = shuffled.slice(0, redSize);
  const bluePlayers = shuffled.slice(redSize);

  if (redPlayers.length < 2 || bluePlayers.length < 2) {
    throw new Error("红蓝双方都需要 1 名队长和至少 1 名队员");
  }

  return {
    red: {
      spymasterId: redPlayers[0]!,
      operativeIds: redPlayers.slice(1),
    },
    blue: {
      spymasterId: bluePlayers[0]!,
      operativeIds: bluePlayers.slice(1),
    },
  };
}

export function countRemainingByTeam(keyGrid: KeyCellState[], board: PublicCardState[]): Record<TeamName, number> {
  const revealed = new Set(board.filter((card) => card.revealedOwner).map((card) => card.id));
  return keyGrid.reduce(
    (counts, cell) => {
      if ((cell.owner === "red" || cell.owner === "blue") && !revealed.has(cell.cardId)) {
        counts[cell.owner] += 1;
      }
      return counts;
    },
    { red: 0, blue: 0 },
  );
}

export function createInitialTurn(startingTeam: TeamName, teams: GameTeams, keyGrid: KeyCellState[], board: PublicCardState[], now: TimeInput = new Date()): TurnState {
  return {
    currentTeam: startingTeam,
    phase: "clue",
    clue: null,
    remainingGuesses: 0,
    activePlayerId: teams[startingTeam].spymasterId,
    nextOperativeIndex: { red: 0, blue: 0 },
    result: null,
    remainingByTeam: countRemainingByTeam(keyGrid, board),
    ...phaseTimes("clue", now),
  };
}

export function submitClue(turn: TurnState, teams: GameTeams, clueText: string, count: number, now: TimeInput = new Date()): TurnState {
  if (turn.phase !== "clue" || turn.result) {
    throw new Error("当前不能提交线索");
  }
  if (count <= 0) {
    throw new Error("线索数量必须大于0");
  }
  if (count > turn.remainingByTeam[turn.currentTeam]) {
    throw new Error("线索数量不能大于己方剩余牌数");
  }

  const operativeIds = teams[turn.currentTeam].operativeIds;
  const activeIndex = turn.nextOperativeIndex[turn.currentTeam] % operativeIds.length;
  const activePlayerId = operativeIds[activeIndex]!;

  return {
    ...turn,
    phase: "guess",
    clue: { text: clueText, count },
    remainingGuesses: count + 1,
    activePlayerId,
    nextOperativeIndex: {
      ...turn.nextOperativeIndex,
      [turn.currentTeam]: (activeIndex + 1) % operativeIds.length,
    },
    ...phaseTimes("guess", now),
  };
}

export function otherTeam(team: TeamName): TeamName {
  return team === "red" ? "blue" : "red";
}

export function endTurn(turn: TurnState, teams: GameTeams, now: TimeInput = new Date()): TurnState {
  if (turn.phase === "ended" || turn.result) {
    return turn;
  }

  const nextTeam = otherTeam(turn.currentTeam);
  return {
    ...turn,
    currentTeam: nextTeam,
    phase: "clue",
    clue: null,
    remainingGuesses: 0,
    activePlayerId: teams[nextTeam].spymasterId,
    ...phaseTimes("clue", now),
  };
}

export function applyGuess(
  board: PublicCardState[],
  keyGrid: KeyCellState[],
  turn: TurnState,
  teams: GameTeams,
  cardId: string,
  now: TimeInput = new Date(),
): { board: PublicCardState[]; turn: TurnState; owner: CardOwner } {
  if (turn.phase !== "guess" || turn.result) {
    throw new Error("当前不能猜牌");
  }

  const card = board.find((entry) => entry.id === cardId);
  if (!card) {
    throw new Error("卡牌不存在");
  }
  if (card.revealedOwner) {
    throw new Error("这张牌已经揭示");
  }

  const owner = keyGrid.find((cell) => cell.cardId === cardId)?.owner;
  if (!owner) {
    throw new Error("答案不存在");
  }

  const nextBoard = board.map((entry) => (entry.id === cardId ? { ...entry, revealedOwner: owner } : entry));
  const remainingByTeam = countRemainingByTeam(keyGrid, nextBoard);
  let nextTurn: TurnState = {
    ...turn,
    remainingGuesses: Math.max(0, turn.remainingGuesses - 1),
    remainingByTeam,
  };

  if (owner === "assassin") {
    nextTurn = {
      ...nextTurn,
      phase: "ended",
      activePlayerId: null,
      result: { winner: otherTeam(turn.currentTeam), reason: "assassin" },
      ...phaseTimes("ended", now),
    };
    return { board: nextBoard, turn: nextTurn, owner };
  }

  if (owner === "red" || owner === "blue") {
    if (remainingByTeam[owner] === 0) {
      nextTurn = {
        ...nextTurn,
        phase: "ended",
        activePlayerId: null,
        result: { winner: owner, reason: "all_revealed" },
        ...phaseTimes("ended", now),
      };
      return { board: nextBoard, turn: nextTurn, owner };
    }
  }

  if (owner !== turn.currentTeam || nextTurn.remainingGuesses === 0) {
    nextTurn = endTurn(nextTurn, teams, now);
  }

  return { board: nextBoard, turn: nextTurn, owner };
}
