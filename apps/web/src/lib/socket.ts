import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001", {
      autoConnect: true,
    });
  }
  return socket;
}

