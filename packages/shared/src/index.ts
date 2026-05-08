import { z } from "zod";

export const roomPhases = ["lobby", "dealt"] as const;
export type RoomPhase = (typeof roomPhases)[number];

export const cardOwners = ["red", "blue", "neutral", "assassin"] as const;
export type CardOwner = (typeof cardOwners)[number];

export const teamNames = ["red", "blue"] as const;
export type TeamName = (typeof teamNames)[number];

export const gameModes = ["text", "image"] as const;
export type GameMode = (typeof gameModes)[number];

export const teamSizes = [4, 5, 6, 7, 8, 9, 10] as const;
export type TeamSize = (typeof teamSizes)[number];

export const playerRoles = [
  "host",
  "red_spymaster",
  "red_operatives",
  "blue_spymaster",
  "blue_operatives",
  "spectator",
] as const;
export type PlayerRole = (typeof playerRoles)[number];

export type CardContent =
  | { type: "word"; text: string }
  | { type: "image"; imageUrl: string; alt: string };

export interface PublicCardState {
  id: string;
  content: CardContent;
  revealedOwner?: CardOwner;
}

export interface KeyCellState {
  cardId: string;
  owner: CardOwner;
}

export interface PlayerState {
  id: string;
  nickname: string;
  role: PlayerRole;
  spectatorIntent: boolean;
  online: boolean;
  joinedAt: string;
}

export interface RoomConfig {
  locale: "zh-CN";
  gameMode: GameMode;
  deckMode: "ai" | "fallback";
  teamSize: TeamSize;
  boardSize: "classic";
}

export interface ActivityEntry {
  id: string;
  createdAt: string;
  type:
    | "system"
    | "role_assigned"
    | "game_started"
    | "player_joined"
    | "player_left"
    | "host_transferred";
  message: string;
}

export interface TeamAssignment {
  spymasterId: string;
  operativeIds: string[];
}

export type GameTeams = Record<TeamName, TeamAssignment>;

export interface TurnClue {
  text: string;
  count: number;
}

export interface TurnResult {
  winner: TeamName;
  reason: "all_revealed" | "assassin";
}

export interface TurnState {
  currentTeam: TeamName;
  phase: "clue" | "guess" | "ended";
  clue: TurnClue | null;
  remainingGuesses: number;
  activePlayerId: string | null;
  nextOperativeIndex: Record<TeamName, number>;
  result: TurnResult | null;
  remainingByTeam: Record<TeamName, number>;
  phaseStartedAt: string;
  deadlineAt: string | null;
}

export interface RoomState {
  roomId: string;
  phase: RoomPhase;
  hostId: string;
  players: PlayerState[];
  config: RoomConfig;
  board: PublicCardState[] | null;
  keyGrid: KeyCellState[] | null;
  teams: GameTeams | null;
  turn: TurnState | null;
  activityLog: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PlayerViewSnapshot extends Omit<RoomState, "keyGrid"> {
  selfId: string;
  selfRole: PlayerRole;
  keyGrid?: KeyCellState[] | null;
}

export interface ValidatedDeck {
  mode: "ai" | "fallback";
  contents: CardContent[];
  model?: string;
}

export function cardDisplayText(card: PublicCardState): string {
  return card.content.type === "word" ? card.content.text : card.content.alt;
}

export function findForbiddenClueText(board: PublicCardState[], clueText: string): string | null {
  const normalizedClue = clueText.trim().toLocaleLowerCase();
  if (!normalizedClue) {
    return null;
  }

  for (const card of board) {
    const displayText = cardDisplayText(card).trim();
    if (displayText && normalizedClue.includes(displayText.toLocaleLowerCase())) {
      return displayText;
    }
  }

  return null;
}

const wordCardSchema = z.object({
  type: z.literal("word"),
  text: z.string().min(2).max(6),
});

const imageCardSchema = z.object({
  type: z.literal("image"),
  imageUrl: z.string().min(1),
  alt: z.string().min(1),
});

export const cardContentSchema = z.discriminatedUnion("type", [wordCardSchema, imageCardSchema]);
export const publicCardStateSchema = z.object({
  id: z.string(),
  content: cardContentSchema,
  revealedOwner: z.enum(cardOwners).optional(),
});

export const keyCellStateSchema = z.object({
  cardId: z.string(),
  owner: z.enum(cardOwners),
});

export const roomConfigSchema = z.object({
  locale: z.literal("zh-CN"),
  gameMode: z.enum(gameModes),
  deckMode: z.enum(["ai", "fallback"]),
  teamSize: z.union([
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
  ]),
  boardSize: z.literal("classic"),
});

export const createRoomPayloadSchema = z.object({
  nickname: z.string().trim().min(1).max(20),
  config: roomConfigSchema.pick({ gameMode: true, teamSize: true }).partial().optional(),
});

export const joinRoomPayloadSchema = z.object({
  roomId: z.string().trim().min(4).max(8),
  nickname: z.string().trim().min(1).max(20),
});

export const rejoinRoomPayloadSchema = z.object({
  roomId: z.string().trim().min(4).max(8),
  playerId: z.string().min(1),
});

export const updateRoomConfigPayloadSchema = z.object({
  roomId: z.string(),
  config: roomConfigSchema.partial(),
});

export const setSpectatorPayloadSchema = z.object({
  roomId: z.string(),
  spectator: z.boolean(),
});

export const assignRolePayloadSchema = z.object({
  roomId: z.string(),
  playerId: z.string(),
  role: z.enum(playerRoles),
});

export const startGamePayloadSchema = z.object({
  roomId: z.string(),
});

export const restartGamePayloadSchema = z.object({
  roomId: z.string(),
});

export const returnToLobbyPayloadSchema = z.object({
  roomId: z.string(),
});

export const submitCluePayloadSchema = z.object({
  roomId: z.string(),
  clue: z.string().trim().min(1).max(20),
  count: z.number().int().min(0).max(9),
});

export const guessCardPayloadSchema = z.object({
  roomId: z.string(),
  cardId: z.string(),
});

export const endTurnPayloadSchema = z.object({
  roomId: z.string(),
});

export const socketEvents = {
  roomCreate: "room:create",
  roomJoin: "room:join",
  roomRejoin: "room:rejoin",
  roomUpdateConfig: "room:update_config",
  roomSetSpectator: "room:set_spectator",
  gameStart: "game:start",
  gameRestart: "game:restart",
  gameReturnToLobby: "game:return_to_lobby",
  gameSubmitClue: "game:submit_clue",
  gameGuessCard: "game:guess_card",
  gameEndTurn: "game:end_turn",
  roomSnapshot: "room:snapshot",
  roomError: "room:error",
  presenceUpdate: "presence:update",
  gameEvent: "game:event",
  connectionRestored: "connection:restored",
} as const;

export type ClientEventName =
  | typeof socketEvents.roomCreate
  | typeof socketEvents.roomJoin
  | typeof socketEvents.roomRejoin
  | typeof socketEvents.roomUpdateConfig
  | typeof socketEvents.roomSetSpectator
  | typeof socketEvents.gameStart
  | typeof socketEvents.gameRestart
  | typeof socketEvents.gameReturnToLobby
  | typeof socketEvents.gameSubmitClue
  | typeof socketEvents.gameGuessCard
  | typeof socketEvents.gameEndTurn;

export type ServerEventName =
  | typeof socketEvents.roomSnapshot
  | typeof socketEvents.roomError
  | typeof socketEvents.presenceUpdate
  | typeof socketEvents.gameEvent
  | typeof socketEvents.connectionRestored;
