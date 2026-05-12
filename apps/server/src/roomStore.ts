import { randomUUID } from "node:crypto";

import { applyGuess, assignTeams, createDeal, createInitialTurn, endTurn, submitClue } from "@codenames/game-core";
import type {
  AiDeckConfig,
  CardOwner,
  DeckPreviewState,
  GameTeams,
  PlayerRole,
  PlayerState,
  PlayerViewSnapshot,
  RoomConfig,
  RoomState,
  TeamName,
  ValidatedDeck,
} from "@codenames/shared";
import { findForbiddenClueText } from "@codenames/shared";

function nowIso(): string {
  return new Date().toISOString();
}

function createRoomId(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function createPlayerId(): string {
  return randomUUID();
}

interface PlayerConnection {
  socketId: string | null;
}

interface StoredPlayer extends PlayerState, PlayerConnection {}

interface StoredRoom extends Omit<RoomState, "players"> {
  players: StoredPlayer[];
  aiConfig: AiDeckConfig | null;
  pendingDeck: ValidatedDeck | null;
}

const defaultConfig: RoomConfig = {
  locale: "zh-CN",
  gameMode: "text",
  deckMode: "fallback",
  teamSize: 4,
  boardSize: "classic",
};

export class RoomStore {
  private rooms = new Map<string, StoredRoom>();
  private readonly ttlMs: number;

  constructor(ttlMs = 1000 * 60 * 60 * 6) {
    this.ttlMs = ttlMs;
  }

  createRoom(nickname: string, socketId: string, partialConfig: Partial<RoomConfig> = {}, aiConfig: AiDeckConfig | null = null) {
    const roomId = this.createAvailableRoomId();
    const hostId = createPlayerId();
    const timestamp = nowIso();
    const config = { ...defaultConfig, ...partialConfig };
    const room: StoredRoom = {
      roomId,
      phase: "lobby",
      hostId,
      config,
      aiConfig: config.gameMode === "image" ? aiConfig : null,
      board: null,
      keyGrid: null,
      teams: null,
      turn: null,
      deckGeneration: null,
      deckPreview: null,
      pendingDeck: null,
      activityLog: [
        {
          id: randomUUID(),
          createdAt: timestamp,
          type: "player_joined",
          message: `${nickname} 创建了发牌房间`,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
      players: [
        {
          id: hostId,
          nickname,
          role: "host",
          spectatorIntent: false,
          online: true,
          joinedAt: timestamp,
          socketId,
        },
      ],
    };
    this.rooms.set(roomId, room);
    return { roomId, playerId: hostId, snapshot: this.toSnapshot(room, hostId) };
  }

  joinRoom(roomId: string, nickname: string, socketId: string) {
    const room = this.requireRoom(roomId);
    if (room.players.some((player) => player.nickname === nickname)) {
      throw new Error("昵称已存在");
    }

    const playerId = createPlayerId();
    const spectatorIntent = this.participantCount(room) >= room.config.teamSize;
    room.players.push({
      id: playerId,
      nickname,
      role: "spectator",
      spectatorIntent,
      online: true,
      joinedAt: nowIso(),
      socketId,
    });
    this.touch(room, {
      type: "player_joined",
      message: `${nickname} 加入了房间`,
    });
    return { playerId, snapshot: this.toSnapshot(room, playerId) };
  }

  rejoinRoom(roomId: string, playerId: string, socketId: string) {
    const room = this.requireRoom(roomId);
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error("玩家不存在");
    }
    player.online = true;
    player.socketId = socketId;
    this.touch(room);
    return this.toSnapshot(room, playerId);
  }

  disconnect(socketId: string) {
    for (const room of this.rooms.values()) {
      const player = room.players.find((entry) => entry.socketId === socketId);
      if (!player) {
        continue;
      }

      player.online = false;
      player.socketId = null;
      this.touch(room, { type: "player_left", message: `${player.nickname} 断开连接` });
      if (room.hostId === player.id) {
        const nextHost = room.players
          .filter((entry) => entry.online)
          .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt))[0];
        if (nextHost) {
          room.hostId = nextHost.id;
          if (room.phase === "lobby" && !nextHost.spectatorIntent) {
            this.resetLobbyRoles(room);
          }
          this.touch(room, { type: "host_transferred", message: `房主已转移给 ${nextHost.nickname}` });
        }
      }
    }
  }

  updateConfig(roomId: string, actorId: string, partial: Partial<RoomConfig>) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    if (room.phase !== "lobby") {
      throw new Error("发牌后不可修改设置，请先重新开局");
    }
    room.config = { ...room.config, ...partial };
    this.touch(room);
  }

  setSpectatorIntent(roomId: string, actorId: string, spectatorIntent: boolean) {
    const room = this.requireRoom(roomId);
    if (room.phase !== "lobby") {
      throw new Error("游戏开始后不可切换旁观状态");
    }
    const player = this.requirePlayer(room, actorId);
    player.spectatorIntent = spectatorIntent;
    this.resetLobbyRoles(room);
    this.touch(room, {
      type: "system",
      message: `${player.nickname} ${spectatorIntent ? "进入旁观者队列" : "加入游戏玩家队列"}`,
    });
  }

  assignRole(roomId: string, actorId: string, targetPlayerId: string, role: PlayerRole) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    const player = room.players.find((entry) => entry.id === targetPlayerId);
    if (!player) {
      throw new Error("玩家不存在");
    }
    player.role = role;
    this.touch(room, { type: "role_assigned", message: `${player.nickname} 被设为 ${role}` });
  }

  startGame(roomId: string, actorId: string, deck: ValidatedDeck) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    this.dealRoom(room, deck, "已发牌");
  }

  previewImageDeck(roomId: string, actorId: string, deck: ValidatedDeck) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    if (room.phase !== "lobby" && room.phase !== "dealt") {
      throw new Error("当前状态不可预览牌阵");
    }
    if (room.config.gameMode !== "image") {
      throw new Error("只有图片模式可以预览图片牌阵");
    }
    if (!deck.contents.every((content) => content.type === "image")) {
      throw new Error("图片预览需要图片牌库");
    }

    room.pendingDeck = deck;
    room.phase = "lobby";
    room.deckPreview = {
      status: "ready",
      message: "图片牌阵已生成，等待房主确认",
      model: deck.model,
      board: deck.contents.map((content, index) => ({
        id: `card-${index + 1}`,
        content,
      })),
    };
    room.deckGeneration = null;
    room.board = null;
    room.keyGrid = null;
    room.teams = null;
    room.turn = null;
    room.config = { ...room.config, deckMode: deck.mode };
    this.touch(room, { type: "system", message: "图片牌阵已生成，等待房主确认" });
  }

  confirmImagePreview(roomId: string, actorId: string) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    if (!room.pendingDeck || !room.deckPreview) {
      throw new Error("没有待确认的图片牌阵");
    }
    this.dealRoom(room, room.pendingDeck, "已确认图片牌阵并发牌");
  }

  getConfig(roomId: string): RoomConfig {
    return this.requireRoom(roomId).config;
  }

  getAiConfig(roomId: string): AiDeckConfig | null {
    return this.requireRoom(roomId).aiConfig;
  }

  setDeckGeneration(roomId: string, actorId: string, deckGeneration: StoredRoom["deckGeneration"]) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    room.deckGeneration = deckGeneration;
    this.touch(room);
  }

  restart(roomId: string, actorId: string, deck: ValidatedDeck) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    this.dealRoom(room, deck, "已重新发牌");
  }

  returnToLobby(roomId: string, actorId: string) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    room.phase = "lobby";
    room.board = null;
    room.keyGrid = null;
    room.teams = null;
    room.turn = null;
    room.deckGeneration = null;
    room.deckPreview = null;
    room.pendingDeck = null;
    this.resetLobbyRoles(room);
    this.touch(room, { type: "system", message: "已返回等候房间" });
  }

  submitClue(roomId: string, actorId: string, clueText: string, count: number) {
    const room = this.requireActiveGame(roomId);
    const actor = this.requirePlayer(room, actorId);
    if (room.turn.activePlayerId !== actor.id || room.teams[room.turn.currentTeam].spymasterId !== actor.id) {
      throw new Error("只有当前队长可以提交线索");
    }
    const forbiddenText = findForbiddenClueText(room.board, clueText);
    if (forbiddenText) {
      throw new Error(`线索不能包含牌阵中出现的字：${forbiddenText}，请重新输入`);
    }

    room.turn = submitClue(room.turn, room.teams, clueText, count);
    this.touch(room, { type: "system", message: `${actor.nickname} 给出线索「${clueText}」 ${count}` });
  }

  guessCard(roomId: string, actorId: string, cardId: string) {
    const room = this.requireActiveGame(roomId);
    const actor = this.requirePlayer(room, actorId);
    if (room.turn.activePlayerId !== actor.id || !room.teams[room.turn.currentTeam].operativeIds.includes(actor.id)) {
      throw new Error("只有当前猜词队员可以猜牌");
    }

    const result = applyGuess(room.board, room.keyGrid, room.turn, room.teams, cardId);
    room.board = result.board;
    room.turn = result.turn;
    this.touch(room, { type: "system", message: `${actor.nickname} 揭示了 ${this.ownerLabel(result.owner)}` });
  }

  endTurn(roomId: string, actorId: string) {
    const room = this.requireActiveGame(roomId);
    const actor = this.requirePlayer(room, actorId);
    if (room.turn.activePlayerId !== actor.id || !room.teams[room.turn.currentTeam].operativeIds.includes(actor.id)) {
      throw new Error("只有当前猜词队员可以结束回合");
    }

    room.turn = endTurn(room.turn, room.teams);
    this.touch(room, { type: "system", message: `${actor.nickname} 结束了回合` });
  }

  getRoomBySocket(socketId: string): StoredRoom | undefined {
    return [...this.rooms.values()].find((room) => room.players.some((player) => player.socketId === socketId));
  }

  snapshotFor(roomId: string, playerId: string): PlayerViewSnapshot {
    return this.toSnapshot(this.requireRoom(roomId), playerId);
  }

  cleanup() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [roomId, room] of this.rooms.entries()) {
      if (new Date(room.updatedAt).getTime() < cutoff) {
        this.rooms.delete(roomId);
      }
    }
  }

  private toSnapshot(room: StoredRoom, playerId: string): PlayerViewSnapshot {
    const self = this.requirePlayer(room, playerId);
    const { players: _players, keyGrid: _keyGrid, aiConfig: _aiConfig, pendingDeck: _pendingDeck, deckPreview: _deckPreview, ...snapshotRoom } = room;
    const canSeeKey = self.role === "red_spymaster" || self.role === "blue_spymaster";
    const canSeePreview = room.hostId === self.id;
    return {
      ...snapshotRoom,
      selfId: self.id,
      selfRole: self.role,
      players: room.players.map(({ socketId: _socketId, ...player }) => player),
      ...(canSeeKey ? { keyGrid: room.keyGrid } : {}),
      deckPreview: this.previewForSnapshot(room.deckPreview, canSeePreview),
    };
  }

  private previewForSnapshot(preview: DeckPreviewState | null, includeBoard: boolean): DeckPreviewState | null {
    if (!preview) {
      return null;
    }
    return includeBoard ? preview : { ...preview, board: null };
  }

  private dealRoom(room: StoredRoom, deck: ValidatedDeck, actionLabel: string) {
    const startingTeam: TeamName = "red";
    const teams = this.assignOnlineTeams(room);
    const deal = createDeal(deck.contents, room.config.gameMode, startingTeam);
    room.phase = "dealt";
    room.board = deal.board;
    room.keyGrid = deal.keyGrid;
    room.teams = teams;
    room.turn = createInitialTurn(startingTeam, teams, deal.keyGrid, deal.board);
    room.deckGeneration = null;
    room.deckPreview = null;
    room.pendingDeck = null;
    room.config = { ...room.config, deckMode: deck.mode };
    this.touch(room, { type: "game_started", message: `${actionLabel}，${startingTeam === "red" ? "红队" : "蓝队"}多一张关键牌` });
  }

  private touch(
    room: StoredRoom,
    activity?: {
      type: RoomState["activityLog"][number]["type"];
      message: string;
    },
  ) {
    room.updatedAt = nowIso();
    if (activity) {
      room.activityLog = [
        ...room.activityLog,
        {
          id: randomUUID(),
          createdAt: room.updatedAt,
          type: activity.type,
          message: activity.message,
        },
      ].slice(-30);
    }
  }

  private requireRoom(roomId: string): StoredRoom {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("房间不存在");
    }
    return room;
  }

  private createAvailableRoomId(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const roomId = createRoomId();
      if (!this.rooms.has(roomId)) {
        return roomId;
      }
    }
    throw new Error("无法生成房间码，请稍后重试");
  }

  private participantCount(room: StoredRoom): number {
    return room.players.filter((player) => !player.spectatorIntent).length;
  }

  private requireActiveGame(roomId: string): StoredRoom & { board: NonNullable<StoredRoom["board"]>; keyGrid: NonNullable<StoredRoom["keyGrid"]>; teams: GameTeams; turn: NonNullable<StoredRoom["turn"]> } {
    const room = this.requireRoom(roomId);
    if (room.phase !== "dealt" || !room.board || !room.keyGrid || !room.teams || !room.turn) {
      throw new Error("游戏尚未开始");
    }
    return room as StoredRoom & {
      board: NonNullable<StoredRoom["board"]>;
      keyGrid: NonNullable<StoredRoom["keyGrid"]>;
      teams: GameTeams;
      turn: NonNullable<StoredRoom["turn"]>;
    };
  }

  private requirePlayer(room: StoredRoom, playerId: string): StoredPlayer {
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error("玩家不存在");
    }
    return player;
  }

  private requireHost(room: StoredRoom, actorId: string) {
    if (room.hostId !== actorId) {
      throw new Error("只有房主可以执行此操作");
    }
  }

  private assignOnlineTeams(room: StoredRoom): GameTeams {
    const onlinePlayers = room.players
      .filter((player) => player.online && !player.spectatorIntent)
      .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt))
      .slice(0, room.config.teamSize);
    if (onlinePlayers.length < room.config.teamSize) {
      throw new Error(`需要 ${room.config.teamSize} 名参赛玩家才能开局`);
    }

    const teams = assignTeams(onlinePlayers.map((player) => player.id));
    const roleByPlayer = new Map<string, PlayerRole>([
      [teams.red.spymasterId, "red_spymaster"],
      [teams.blue.spymasterId, "blue_spymaster"],
      ...teams.red.operativeIds.map((id) => [id, "red_operatives"] as const),
      ...teams.blue.operativeIds.map((id) => [id, "blue_operatives"] as const),
    ]);

    for (const player of room.players) {
      player.role = roleByPlayer.get(player.id) ?? "spectator";
    }

    return teams;
  }

  private resetLobbyRoles(room: StoredRoom) {
    for (const player of room.players) {
      player.role = player.id === room.hostId && !player.spectatorIntent ? "host" : "spectator";
    }
  }

  private ownerLabel(owner: CardOwner) {
    const labels: Record<CardOwner, string> = {
      red: "红队牌",
      blue: "蓝队牌",
      neutral: "平民牌",
      assassin: "刺客牌",
    };
    return labels[owner];
  }
}
