import { createServer } from "node:http";

import cors from "cors";
import express, { type Express } from "express";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

import {
  joinRoomPayloadSchema,
  rejoinRoomPayloadSchema,
  confirmDeckPreviewPayloadSchema,
  restartGamePayloadSchema,
  regenerateDeckPreviewPayloadSchema,
  returnToLobbyPayloadSchema,
  setSpectatorPayloadSchema,
  socketEvents,
  startGamePayloadSchema,
  updateRoomConfigPayloadSchema,
  createRoomPayloadSchema,
  submitCluePayloadSchema,
  guessCardPayloadSchema,
  endTurnPayloadSchema,
} from "@codenames/shared";

import { createFallbackDeck, generateAiDeck } from "./deckService.js";
import { GeneratedImageStore } from "./generatedImageStore.js";
import { RoomStore } from "./roomStore.js";

interface AppServer {
  app: Express;
  httpServer: HttpServer;
  io: Server;
  roomStore: RoomStore;
  imageStore: GeneratedImageStore;
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
  const imageStore = new GeneratedImageStore();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/host-info", (_req, res) => {
    res.json(options.getHostInfo?.() ?? null);
  });
  app.get("/generated-cards/:roomId/:dealId/:cardId.png", (req, res) => {
    const image = imageStore.getByRoute(req.params.roomId, req.params.dealId, req.params.cardId);
    if (!image) {
      res.status(404).json({ message: "Image not found" });
      return;
    }
    res.type(image.contentType).send(image.data);
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const roomStore = new RoomStore();

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
      handle(createRoomPayloadSchema, ({ nickname, config, aiConfig }) => {
        const created = roomStore.createRoom(nickname, socket.id, config ?? {}, aiConfig ?? null);
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
      socketEvents.roomSetSpectator,
      handle(setSpectatorPayloadSchema, ({ roomId, spectator }) => {
        roomStore.setSpectatorIntent(roomId, socket.data.playerId, spectator);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameStart,
      handle(startGamePayloadSchema, async ({ roomId }) => {
        const config = roomStore.getConfig(roomId);
        const aiConfig = roomStore.getAiConfig(roomId);
        if (aiConfig) {
          roomStore.setDeckGeneration(roomId, socket.data.playerId, {
            active: true,
            message: config.gameMode === "image" ? "AI 正在生成 5x5 图片牌阵" : "AI 正在生成 25 个词牌",
          });
          emitSnapshot(roomId);
        }
        try {
          const deck = aiConfig ? await generateAiDeck({ mode: config.gameMode, aiConfig, imageStore, roomId }) : createFallbackDeck(config.gameMode);
          if (aiConfig && config.gameMode === "image") {
            roomStore.previewImageDeck(roomId, socket.data.playerId, deck);
          } else {
            roomStore.startGame(roomId, socket.data.playerId, deck);
          }
        } catch (error) {
          if (aiConfig) {
            roomStore.setDeckGeneration(roomId, socket.data.playerId, null);
            emitSnapshot(roomId);
          }
          throw error;
        }
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameRegeneratePreview,
      handle(regenerateDeckPreviewPayloadSchema, async ({ roomId }) => {
        const config = roomStore.getConfig(roomId);
        const aiConfig = roomStore.getAiConfig(roomId);
        if (!aiConfig || config.gameMode !== "image") {
          throw new Error("当前房间没有可重新生成的图片大模型牌库");
        }
        roomStore.setDeckGeneration(roomId, socket.data.playerId, {
          active: true,
          message: "AI 正在重新生成 5x5 图片牌阵",
        });
        emitSnapshot(roomId);
        try {
          const deck = await generateAiDeck({ mode: config.gameMode, aiConfig, imageStore, roomId });
          roomStore.previewImageDeck(roomId, socket.data.playerId, deck);
        } catch (error) {
          roomStore.setDeckGeneration(roomId, socket.data.playerId, null);
          emitSnapshot(roomId);
          throw error;
        }
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameConfirmPreview,
      handle(confirmDeckPreviewPayloadSchema, ({ roomId }) => {
        roomStore.confirmImagePreview(roomId, socket.data.playerId);
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameRestart,
      handle(restartGamePayloadSchema, async ({ roomId }) => {
        const config = roomStore.getConfig(roomId);
        const aiConfig = roomStore.getAiConfig(roomId);
        if (aiConfig) {
          roomStore.setDeckGeneration(roomId, socket.data.playerId, {
            active: true,
            message: config.gameMode === "image" ? "AI 正在重新生成 5x5 图片牌阵" : "AI 正在重新生成 25 个词牌",
          });
          emitSnapshot(roomId);
        }
        try {
          const deck = aiConfig ? await generateAiDeck({ mode: config.gameMode, aiConfig, imageStore, roomId }) : createFallbackDeck(config.gameMode);
          roomStore.restart(roomId, socket.data.playerId, deck);
        } catch (error) {
          if (aiConfig) {
            roomStore.setDeckGeneration(roomId, socket.data.playerId, null);
            emitSnapshot(roomId);
          }
          throw error;
        }
        emitSnapshot(roomId);
      }),
    );

    socket.on(
      socketEvents.gameReturnToLobby,
      handle(returnToLobbyPayloadSchema, ({ roomId }) => {
        roomStore.returnToLobby(roomId, socket.data.playerId);
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

  return { app, httpServer, io, roomStore, imageStore };
}
