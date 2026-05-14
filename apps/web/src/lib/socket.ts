import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function resolveServerUrlForLocation(envServerUrl: string | undefined, location: Location) {
  if (envServerUrl) {
    const configured = new URL(envServerUrl);
    if (isLoopbackHost(configured.hostname) && !isLoopbackHost(location.hostname)) {
      configured.hostname = location.hostname;
      return configured.toString().replace(/\/$/, "");
    }
    return envServerUrl;
  }
  if (location.port === "5173") {
    return `${location.protocol}//${location.hostname}:3001`;
  }
  return location.origin;
}

function resolveServerUrl() {
  return resolveServerUrlForLocation(import.meta.env.VITE_SERVER_URL, window.location);
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
