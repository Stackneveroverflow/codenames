import type { Server as HttpServer } from "node:http";
import path from "node:path";

import { app, BrowserWindow, clipboard, Menu, shell, type BrowserWindowConstructorOptions, type MenuItemConstructorOptions } from "electron";
import express from "express";

import { createHostInfo } from "../../server/src/network";
import { attachStaticClient, createAppServer, type HostInfo } from "../../server/src/socketServer";

const DEFAULT_PORT = parsePort(process.env.CODENAMES_HOST_PORT, 3210);
const desktopDistDir = __dirname;
const playerWindowContentSize = {
  width: 520,
  height: 1040,
};
const playerWindowOptions: BrowserWindowConstructorOptions = {
  width: playerWindowContentSize.width,
  height: playerWindowContentSize.height,
  useContentSize: true,
  minWidth: 390,
  minHeight: 760,
  title: "行动代号",
  backgroundColor: "#171412",
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
  },
};

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
  attachStaticClient(webApp, { webDist, entryDist });
}

function entryUrl(hostInfo: HostInfo, route = "/entry/") {
  return new URL(route, `http://127.0.0.1:${hostInfo.port}`).toString();
}

function shareEntryUrl(hostInfo: HostInfo) {
  return new URL("/entry/", hostInfo.lanUrls[0] ?? hostInfo.localUrl).toString();
}

function enforcePlayerContentSize(window: BrowserWindow) {
  window.setContentSize(playerWindowContentSize.width, playerWindowContentSize.height);
}

function configurePlayerWindow(window: BrowserWindow, hostInfo: HostInfo) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(hostInfo.localUrl) || url.startsWith(`http://127.0.0.1:${hostInfo.port}`)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: playerWindowOptions,
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function loadPlayerEntry(window: BrowserWindow, hostInfo: HostInfo, route = "/entry/") {
  configurePlayerWindow(window, hostInfo);
  enforcePlayerContentSize(window);
  window.webContents.once("did-finish-load", () => enforcePlayerContentSize(window));
  void window.loadURL(entryUrl(hostInfo, route));
}

function createPlayerWindow(hostInfo: HostInfo, route = "/entry/") {
  const window = new BrowserWindow(playerWindowOptions);
  loadPlayerEntry(window, hostInfo, route);
  return window;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

function startupPage(message = "正在启动本机服务") {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>行动代号</title>
    <style>
      :root { color-scheme: dark; font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 50% 18%, rgba(54, 112, 150, 0.34), transparent 34%),
          linear-gradient(180deg, #171412, #090807);
        color: #fff1cf;
      }
      main { display: grid; gap: 18px; justify-items: center; text-align: center; }
      h1 { margin: 0; font-size: 42px; line-height: 1; letter-spacing: 0; }
      p { margin: 0; color: rgba(255, 241, 207, 0.78); font-weight: 800; }
      .pulse {
        width: 42px;
        aspect-ratio: 1;
        border: 2px solid rgba(240, 203, 122, 0.28);
        border-top-color: #f0cb7a;
        border-radius: 999px;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main>
      <div class="pulse"></div>
      <h1>行动代号</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

function startupDataUrl(message?: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(startupPage(message))}`;
}

function createStartupWindow() {
  const window = new BrowserWindow(playerWindowOptions);
  enforcePlayerContentSize(window);
  void window.loadURL(startupDataUrl());
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

  const startupWindow = createStartupWindow();
  const webDist = resolveWebDist();
  const entryDist = resolveEntryDist();
  const { hostInfo } = await startEmbeddedServer(webDist, entryDist);

  installMenu(hostInfo);
  if (startupWindow.isDestroyed()) {
    createPlayerWindow(hostInfo);
  } else {
    loadPlayerEntry(startupWindow, hostInfo);
  }

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
  const [window] = BrowserWindow.getAllWindows();
  if (window && !window.isDestroyed()) {
    const message = error instanceof Error ? error.message : String(error);
    void window.loadURL(startupDataUrl(`启动失败：${message}`));
    return;
  }
  app.quit();
});
