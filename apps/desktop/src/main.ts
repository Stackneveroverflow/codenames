import type { Server as HttpServer } from "node:http";
import path from "node:path";

import { app, BrowserWindow, clipboard, Menu, shell, type MenuItemConstructorOptions } from "electron";
import express from "express";

import { createHostInfo } from "../../server/src/network";
import { createAppServer, type HostInfo } from "../../server/src/socketServer";

const DEFAULT_PORT = parsePort(process.env.CODENAMES_HOST_PORT, 3210);
const desktopDistDir = __dirname;

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function resolveWebDist() {
  return path.resolve(desktopDistDir, "../../web/dist");
}

function resolveEntryDist() {
  return path.resolve(desktopDistDir, "../../entry/dist");
}

function attachWebClient(webApp: express.Express, webDist: string, entryDist: string) {
  webApp.use("/assets", express.static(path.join(entryDist, "assets")));
  webApp.use("/entry", express.static(entryDist));
  webApp.get(/^\/entry(?:\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(entryDist, "index.html"));
  });

  webApp.use(express.static(webDist));
  webApp.get(/.*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

function entryUrl(hostInfo: HostInfo, route = "/entry/") {
  return new URL(route, `http://127.0.0.1:${hostInfo.port}`).toString();
}

function shareEntryUrl(hostInfo: HostInfo) {
  return new URL("/entry/", hostInfo.lanUrls[0] ?? hostInfo.localUrl).toString();
}

function createPlayerWindow(hostInfo: HostInfo, route = "/entry/") {
  const window = new BrowserWindow({
    width: 430,
    height: 900,
    minWidth: 390,
    minHeight: 760,
    title: "行动代号",
    backgroundColor: "#171412",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(hostInfo.localUrl) || url.startsWith(`http://127.0.0.1:${hostInfo.port}`)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.loadURL(entryUrl(hostInfo, route));
  return window;
}

function installMenu(hostInfo: HostInfo) {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "行动代号",
      submenu: [
        {
          label: "新开玩家窗口",
          accelerator: "CmdOrCtrl+N",
          click: () => createPlayerWindow(hostInfo),
        },
        {
          label: "复制入口地址",
          click: () => {
            clipboard.writeText(shareEntryUrl(hostInfo));
          },
        },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "重置缩放" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function isAddressInUse(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "EADDRINUSE";
}

function listen(httpServer: HttpServer, port: number) {
  return new Promise<void>((resolve, reject) => {
    function onError(error: Error) {
      httpServer.off("listening", onListening);
      reject(error);
    }

    function onListening() {
      httpServer.off("error", onError);
      resolve();
    }

    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port, "0.0.0.0");
  });
}

async function startEmbeddedServer(webDist: string, entryDist: string) {
  for (let offset = 0; offset < 50; offset += 1) {
    const port = DEFAULT_PORT + offset;
    const hostInfo = createHostInfo(port);
    const embeddedServer = createAppServer({ getHostInfo: () => hostInfo });
    attachWebClient(embeddedServer.app, webDist, entryDist);

    try {
      await listen(embeddedServer.httpServer, port);
      return { embeddedServer, hostInfo };
    } catch (error) {
      embeddedServer.httpServer.close();
      if (isAddressInUse(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`未找到可用端口：${DEFAULT_PORT}-${DEFAULT_PORT + 49}`);
}

async function main() {
  await app.whenReady();

  const webDist = resolveWebDist();
  const entryDist = resolveEntryDist();
  const { hostInfo } = await startEmbeddedServer(webDist, entryDist);

  installMenu(hostInfo);
  createPlayerWindow(hostInfo);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPlayerWindow(hostInfo);
    }
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

main().catch((error) => {
  console.error(error);
  app.quit();
});
