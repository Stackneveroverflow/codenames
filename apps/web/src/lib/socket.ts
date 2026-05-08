import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function resolveServerUrl() {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  if (window.location.port === "5173") {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return window.location.origin;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(resolveServerUrl(), {
      autoConnect: true,
    });
  }
  return socket;
}

export function getServerUrl() {
  return resolveServerUrl();
}
