import { createServer } from "node:http";

import cors from "cors";
import express, { type Express } from "express";
import OpenAI from "openai";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

import {
  joinRoomPayloadSchema,
  rejoinRoomPayloadSchema,
  restartGamePayloadSchema,
  socketEvents,
  startGamePayloadSchema,
  updateRoomConfigPayloadSchema,
  createRoomPayloadSchema,
  submitCluePayloadSchema,
  guessCardPayloadSchema,
  endTurnPayloadSchema,
} from "@codenames/shared";

import { createFallbackDeck, generateAiDeck } from "./deckService.js";
import { RoomStore } from "./roomStore.js";

interface AppServer {
  app: Express;
  httpServer: HttpServer;
  io: Server;
  roomStore: RoomStore;
}

export interface HostInfo {
  port: number;
  localUrl: string;
  lanUrls: string[];
}

export interface AppServerOptions {
  getHostInfo?: () => HostInfo;
}

export function createAppServer(options: AppServerOptions = {}): AppServer {
  const app = express();
  app.use(cors());
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/host-info", (_req, res) => {
    res.json(options.getHostInfo?.() ?? null);
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const roomStore = new RoomStore();
  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : undefined;

  function emitSnapshot(roomId: string) {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room) {
      return;
    }
    for (const socketId of room) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) {
        continue;
      }
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) {
        continue;
      }
      socket.emit(socketEvents.roomSnapshot, roomStore.snapshotFor(roomId, playerId));
    }
  }

  io.on("connection", (socket) => {
    const handle = <TPayload>(
      schema: { parse: (value: unknown) => TPayload },
      callback: (payload: TPayload) => Promise<void> | void,
    ) => async (payload: unknown) => {
      try {
        const parsed = schema.parse(payload);
        await callback(parsed);
      } catch (error) {
        socket.emit(socketEvents.roomError, {
          message: error instanceof Error ? error.message : "未知错误",
        });
      }
    };

    socket.on(
      socketEvents.roomCreate,
      handle(createRoomPayloadSchema, ({ nickname, config }) => {
        const created = roomStore.createRoom(nickname, socket.id, config ?? {});
        socket.data.playerId = created.playerId;
        socket.data.roomId = created.roomId;
        socket.join(created.roomId);
        socket.emit(socketEvents.roomSnapshot, created.snapshot);
      }),
    );

    socket.on(
      socketEvents.roomJoin,
      handle(joinRoomPayloadSchema, ({ roomId, nickname }) => {
        const joined = roomStore.joinRoom(roomId, nickname, socket.id);
        socket.data.playerId = joined.playerId;
        socket.data.roomId = roomId;
        socket.join(roomId);
        socket.emit(socketEvents.roomSnapshot, joined.snapshot);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.roomRejoin,
      handle(rejoinRoomPayloadSchema, ({ roomId, playerId }) => {
        const snapshot = roomStore.rejoinRoom(roomId, playerId, socket.id);
        socket.data.playerId = playerId;
        socket.data.roomId = roomId;
        socket.join(roomId);
        socket.emit(socketEvents.connectionRestored, { roomId, playerId });
        socket.emit(socketEvents.roomSnapshot, snapshot);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.roomUpdateConfig,
      handle(updateRoomConfigPayloadSchema, ({ roomId, config }) => {
        roomStore.updateConfig(roomId, socket.data.playerId, config);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameStart,
      handle(startGamePayloadSchema, async ({ roomId }) => {
        const config = roomStore.getConfig(roomId);
        const deck = config.deckMode === "ai" ? await generateAiDeck(openai, config.gameMode) : createFallbackDeck(config.gameMode);
        roomStore.startGame(roomId, socket.data.playerId, deck);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameRestart,
      handle(restartGamePayloadSchema, async ({ roomId }) => {
        const config = roomStore.getConfig(roomId);
        const deck = config.deckMode === "ai" ? await generateAiDeck(openai, config.gameMode) : createFallbackDeck(config.gameMode);
        roomStore.restart(roomId, socket.data.playerId, deck);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameSubmitClue,
      handle(submitCluePayloadSchema, ({ roomId, clue, count }) => {
        roomStore.submitClue(roomId, socket.data.playerId, clue, count);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameGuessCard,
      handle(guessCardPayloadSchema, ({ roomId, cardId }) => {
        roomStore.guessCard(roomId, socket.data.playerId, cardId);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameEndTurn,
      handle(endTurnPayloadSchema, ({ roomId }) => {
        roomStore.endTurn(roomId, socket.data.playerId);
        emitSnapshot(roomId);
      }),
    );

    socket.on("disconnect", () => {
      const roomId = socket.data.roomId as string | undefined;
      roomStore.disconnect(socket.id);
      if (roomId) {
        emitSnapshot(roomId);
      }
    });
  });

  setInterval(() => roomStore.cleanup(), 60_000).unref();

  return { app, httpServer, io, roomStore };
}
