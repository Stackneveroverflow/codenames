import { z } from "zod";

export const roomPhases = ["lobby", "setup", "in_round", "finished"] as const;
export type RoomPhase = (typeof roomPhases)[number];

export const cardOwners = ["red", "blue", "neutral", "assassin"] as const;
export type CardOwner = (typeof cardOwners)[number];

export const teamNames = ["red", "blue"] as const;
export type TeamName = (typeof teamNames)[number];

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

export interface CardState {
  id: string;
  content: CardContent;
  owner: CardOwner;
  revealed: boolean;
}

export interface PlayerState {
  id: string;
  nickname: string;
  role: PlayerRole;
  online: boolean;
  joinedAt: string;
}

export interface RoomConfig {
  locale: "zh-CN";
  deckMode: "ai" | "fallback";
  boardSize: "classic";
}

export interface ClueState {
  byPlayerId: string;
  clue: string;
  count: number;
  guessesRemaining: number;
}

export interface TurnState {
  team: TeamName;
  clue: ClueState | null;
  phase: "clue" | "guess";
}

export interface WinnerState {
  team: TeamName;
  reason: "all_found" | "assassin";
}

export interface ActivityEntry {
  id: string;
  createdAt: string;
  type:
    | "system"
    | "role_assigned"
    | "game_started"
    | "clue_submitted"
    | "card_guessed"
    | "turn_ended"
    | "game_finished"
    | "player_joined"
    | "player_left"
    | "host_transferred";
  message: string;
}

export interface RoomState {
  roomId: string;
  phase: RoomPhase;
  hostId: string;
  players: PlayerState[];
  config: RoomConfig;
  board: CardState[] | null;
  turn: TurnState | null;
  winner: WinnerState | null;
  activityLog: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface VisibleCardState extends Omit<CardState, "owner"> {
  owner?: CardOwner;
}

export interface PlayerViewSnapshot extends Omit<RoomState, "board"> {
  selfId: string;
  selfRole: PlayerRole;
  board: VisibleCardState[] | null;
}

export interface ValidatedDeck {
  mode: "ai" | "fallback";
  contents: Extract<CardContent, { type: "word" }>[];
  model?: string;
}

const wordCardSchema = z.object({
  type: z.literal("word"),
  text: z.string().min(2).max(6),
});

const imageCardSchema = z.object({
  type: z.literal("image"),
  imageUrl: z.string().url(),
  alt: z.string().min(1),
});

export const cardContentSchema = z.discriminatedUnion("type", [wordCardSchema, imageCardSchema]);
export const cardStateSchema = z.object({
  id: z.string(),
  content: cardContentSchema,
  owner: z.enum(cardOwners),
  revealed: z.boolean(),
});

export const roomConfigSchema = z.object({
  locale: z.literal("zh-CN"),
  deckMode: z.enum(["ai", "fallback"]),
  boardSize: z.literal("classic"),
});

export const createRoomPayloadSchema = z.object({
  nickname: z.string().trim().min(1).max(20),
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

export const assignRolePayloadSchema = z.object({
  roomId: z.string(),
  playerId: z.string(),
  role: z.enum(playerRoles),
});

export const startGamePayloadSchema = z.object({
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

export const restartGamePayloadSchema = z.object({
  roomId: z.string(),
});

export const socketEvents = {
  roomCreate: "room:create",
  roomJoin: "room:join",
  roomRejoin: "room:rejoin",
  roomUpdateConfig: "room:update_config",
  roomAssignRole: "room:assign_role",
  gameStart: "game:start",
  gameSubmitClue: "game:submit_clue",
  gameGuessCard: "game:guess_card",
  gameEndTurn: "game:end_turn",
  gameRestart: "game:restart",
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
  | typeof socketEvents.roomAssignRole
  | typeof socketEvents.gameStart
  | typeof socketEvents.gameSubmitClue
  | typeof socketEvents.gameGuessCard
  | typeof socketEvents.gameEndTurn
  | typeof socketEvents.gameRestart;

export type ServerEventName =
  | typeof socketEvents.roomSnapshot
  | typeof socketEvents.roomError
  | typeof socketEvents.presenceUpdate
  | typeof socketEvents.gameEvent
  | typeof socketEvents.connectionRestored;
