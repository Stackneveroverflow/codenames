import "./styles.css";
import packageJson from "../../../package.json";

const windowFeatures = "popup,width=520,height=1040";
const appVersionLabel = `v${packageJson.version}`;

function targetGameUrl() {
  const target = new URL(window.location.href);
  if (target.port === "5174") {
    target.port = "5173";
  }
  target.pathname = "/";
  target.search = window.location.search;
  target.hash = "";
  return target.toString();
}

document.getElementById("enter-game")?.addEventListener("click", () => {
  window.open(targetGameUrl(), "_blank", windowFeatures);
});

const versionBadge = document.getElementById("app-version");
if (versionBadge) {
  versionBadge.textContent = appVersionLabel;
}
