import { createServer } from "node:net";
import path from "node:path";

import { app, BrowserWindow, clipboard, Menu, shell, type MenuItemConstructorOptions } from "electron";
import express from "express";

import { createHostInfo } from "../../server/src/network";
import { createAppServer, type HostInfo } from "../../server/src/socketServer";

const DEFAULT_PORT = Number(process.env.CODENAMES_HOST_PORT ?? 3210);
const desktopDistDir = __dirname;

async function findOpenPort(startPort: number) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await canUsePort(port)) {
      return port;
    }
  }
  throw new Error(`未找到可用端口：${startPort}-${startPort + 49}`);
}

function canUsePort(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

function resolveWebDist() {
  return path.resolve(desktopDistDir, "../../web/dist");
}

function attachWebClient(webApp: express.Express, webDist: string) {
  webApp.use(express.static(webDist));
  webApp.get(/.*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

function createPlayerWindow(hostInfo: HostInfo, route = "/") {
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

  window.loadURL(`http://127.0.0.1:${hostInfo.port}${route}`);
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
          label: "复制本机地址",
          click: () => {
            clipboard.writeText(hostInfo.lanUrls[0] ?? hostInfo.localUrl);
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

async function main() {
  await app.whenReady();

  const port = await findOpenPort(DEFAULT_PORT);
  const hostInfo = createHostInfo(port);
  const webDist = resolveWebDist();
  const embeddedServer = createAppServer({ getHostInfo: () => hostInfo });
  attachWebClient(embeddedServer.app, webDist);

  await new Promise<void>((resolve) => {
    embeddedServer.httpServer.listen(port, "0.0.0.0", resolve);
  });

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
