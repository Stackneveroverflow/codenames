import { randomUUID } from "node:crypto";

import { createBoard, createInitialTurn, endTurn, guessCard, submitClue } from "@codenames/game-core";
import type { PlayerRole, PlayerState, PlayerViewSnapshot, RoomConfig, RoomState, TeamName, ValidatedDeck } from "@codenames/shared";

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
}

const defaultConfig: RoomConfig = {
  locale: "zh-CN",
  gameMode: "text",
  deckMode: "ai",
  teamSize: 2,
  boardSize: "classic",
};

export class RoomStore {
  private rooms = new Map<string, StoredRoom>();
  private readonly ttlMs: number;

  constructor(ttlMs = 1000 * 60 * 60 * 6) {
    this.ttlMs = ttlMs;
  }

  createRoom(nickname: string, socketId: string, partialConfig: Partial<RoomConfig> = {}) {
    const roomId = createRoomId();
    const hostId = createPlayerId();
    const timestamp = nowIso();
    const room: StoredRoom = {
      roomId,
      phase: "lobby",
      hostId,
      config: { ...defaultConfig, ...partialConfig },
      board: null,
      turn: null,
      winner: null,
      activityLog: [
        {
          id: randomUUID(),
          createdAt: timestamp,
          type: "player_joined",
          message: `${nickname} 创建了房间`,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
      players: [
        {
          id: hostId,
          nickname,
          role: "host",
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
    room.players.push({
      id: playerId,
      nickname,
      role: "spectator",
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
          if (nextHost.role === "spectator") {
            nextHost.role = "host";
          }
          this.touch(room, { type: "host_transferred", message: `房主已转移给 ${nextHost.nickname}` });
        }
      }
    }
  }

  updateConfig(roomId: string, actorId: string, partial: Partial<RoomConfig>) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    if (typeof partial.teamSize === "number" && partial.teamSize < this.countTeamMembers(room, "red")) {
      throw new Error("红队人数已超过该上限");
    }
    if (typeof partial.teamSize === "number" && partial.teamSize < this.countTeamMembers(room, "blue")) {
      throw new Error("蓝队人数已超过该上限");
    }
    room.config = { ...room.config, ...partial };
    this.touch(room);
  }

  assignRole(roomId: string, actorId: string, targetPlayerId: string, role: PlayerRole) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    const player = room.players.find((entry) => entry.id === targetPlayerId);
    if (!player) {
      throw new Error("玩家不存在");
    }
    this.ensureRoleFitsTeamSize(room, player.id, role);
    player.role = role;
    this.touch(room, { type: "role_assigned", message: `${player.nickname} 被分配为 ${role}` });
  }

  startGame(roomId: string, actorId: string, deck: ValidatedDeck) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    const starter = Math.random() > 0.5 ? "red" : "blue";
    room.phase = "in_round";
    room.board = createBoard(deck.contents, starter);
    room.turn = createInitialTurn(starter);
    room.winner = null;
    this.touch(room, { type: "game_started", message: `对局开始，${starter === "red" ? "红队" : "蓝队"}先手` });
  }

  getConfig(roomId: string): RoomConfig {
    return this.requireRoom(roomId).config;
  }

  submitClue(roomId: string, actorId: string, clue: string, count: number) {
    const room = this.requireInRound(roomId);
    const player = this.requirePlayer(room, actorId);
    this.requireCurrentSpymaster(room, player.id, player.role);
    room.turn = submitClue(room.turn!, actorId, clue, count);
    this.touch(room, { type: "clue_submitted", message: `${player.nickname} 提交线索：${clue} ${count}` });
  }

  guessCard(roomId: string, actorId: string, cardId: string) {
    const room = this.requireInRound(roomId);
    const player = this.requirePlayer(room, actorId);
    this.requireCurrentOperative(room, player.id, player.role);
    const result = guessCard({ board: room.board!, turn: room.turn!, winner: room.winner }, cardId);
    room.board = room.board!.map((card) => (card.id === result.card.id ? result.card : card));
    room.turn = result.nextTurn;
    room.winner = result.winner ?? room.winner;
    if (result.winner) {
      room.phase = "finished";
      this.touch(room, { type: "game_finished", message: `${player.nickname} 触发胜利：${result.winner.team}` });
      return;
    }
    this.touch(room, {
      type: "card_guessed",
      message: `${player.nickname} 翻开了 ${this.getCardLabel(result.card.owner)}`,
    });
  }

  endTurn(roomId: string, actorId: string) {
    const room = this.requireInRound(roomId);
    const player = this.requirePlayer(room, actorId);
    this.requireCurrentOperative(room, player.id, player.role);
    room.turn = endTurn(room.turn!);
    this.touch(room, { type: "turn_ended", message: `${player.nickname} 结束了本回合` });
  }

  restart(roomId: string, actorId: string) {
    const room = this.requireRoom(roomId);
    this.requireHost(room, actorId);
    room.phase = "lobby";
    room.board = null;
    room.turn = null;
    room.winner = null;
    this.touch(room, { type: "system", message: "房主重置了对局" });
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
    const revealOwners = self.role === "red_spymaster" || self.role === "blue_spymaster";
    return {
      ...room,
      selfId: self.id,
      selfRole: self.role,
      players: room.players.map(({ socketId: _socketId, ...player }) => player),
      board: room.board?.map((card) => ({
        id: card.id,
        content: card.content,
        revealed: card.revealed,
        ...(card.revealed || revealOwners ? { owner: card.owner } : {}),
      })) ?? null,
    };
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

  private countTeamMembers(room: StoredRoom, team: TeamName) {
    return room.players.filter((player) =>
      team === "red"
        ? player.role === "red_spymaster" || player.role === "red_operatives"
        : player.role === "blue_spymaster" || player.role === "blue_operatives",
    ).length;
  }

  private ensureRoleFitsTeamSize(room: StoredRoom, targetPlayerId: string, nextRole: PlayerRole) {
    const isTeamRole = nextRole === "red_spymaster" || nextRole === "red_operatives" || nextRole === "blue_spymaster" || nextRole === "blue_operatives";
    if (!isTeamRole) {
      return;
    }

    const nextTeam = nextRole.startsWith("red") ? "red" : "blue";
    const projectedCount = room.players.filter((player) => {
      if (player.id === targetPlayerId) {
        return true;
      }

      return nextTeam === "red"
        ? player.role === "red_spymaster" || player.role === "red_operatives"
        : player.role === "blue_spymaster" || player.role === "blue_operatives";
    }).length;

    if (projectedCount > room.config.teamSize) {
      throw new Error(`每队最多 ${room.config.teamSize} 人`);
    }
  }

  private requireRoom(roomId: string): StoredRoom {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("房间不存在");
    }
    return room;
  }

  private requireInRound(roomId: string): StoredRoom {
    const room = this.requireRoom(roomId);
    if (!room.board || !room.turn) {
      throw new Error("对局尚未开始");
    }
    return room;
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

  private requireCurrentSpymaster(room: StoredRoom, actorId: string, role: PlayerRole) {
    const expectedRole = room.turn?.team === "red" ? "red_spymaster" : "blue_spymaster";
    if (actorId !== this.requirePlayer(room, actorId).id || role !== expectedRole || room.turn?.phase !== "clue") {
      throw new Error("当前不是你的队长回合");
    }
  }

  private requireCurrentOperative(room: StoredRoom, actorId: string, role: PlayerRole) {
    const expectedRole = room.turn?.team === "red" ? "red_operatives" : "blue_operatives";
    if (actorId !== this.requirePlayer(room, actorId).id || role !== expectedRole || room.turn?.phase !== "guess") {
      throw new Error("当前不是你的队员回合");
    }
  }

  private getCardLabel(owner: TeamName | "neutral" | "assassin"): string {
    switch (owner) {
      case "red":
        return "红队牌";
      case "blue":
        return "蓝队牌";
      case "neutral":
        return "中立牌";
      case "assassin":
        return "刺客牌";
    }
  }
}
