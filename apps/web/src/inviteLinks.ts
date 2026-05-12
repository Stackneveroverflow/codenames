export type HostInfo = { port: number; localUrl: string; lanUrls: string[] };

export function isDevEntryPort(port: string) {
  return port === "5173" || port === "5174";
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function desktopInviteBase(currentUrl: URL, hostInfo?: HostInfo | null) {
  if (hostInfo?.lanUrls[0]) {
    return new URL(hostInfo.lanUrls[0]);
  }
  if (!isLoopbackHost(currentUrl.hostname)) {
    return new URL(currentUrl.origin);
  }
  return null;
}

export function canCopyInviteLink(currentHref: string, hostInfo?: HostInfo | null) {
  const currentUrl = new URL(currentHref);
  if (isDevEntryPort(currentUrl.port)) {
    return true;
  }
  return Boolean(desktopInviteBase(currentUrl, hostInfo));
}

export function entryJoinUrl(roomId: string, currentHref: string, hostInfo?: HostInfo | null) {
  const target = new URL(currentHref);

  if (isDevEntryPort(target.port)) {
    target.port = "5174";
    target.pathname = "/";
  } else {
    const sharedTarget = desktopInviteBase(target, hostInfo) ?? new URL(target.origin);
    target.protocol = sharedTarget.protocol;
    target.host = sharedTarget.host;
    target.pathname = "/entry/";
  }

  target.search = "";
  target.hash = "";
  target.searchParams.set("join", roomId);
  return target.toString();
}
