import "./styles.css";

const windowFeatures = "popup,width=520,height=1040";

function targetGameUrl() {
  const target = new URL(window.location.href);
  target.port = "5173";
  target.pathname = "/";
  target.search = window.location.search;
  target.hash = "";
  return target.toString();
}

document.getElementById("enter-game")?.addEventListener("click", () => {
  window.open(targetGameUrl(), "_blank", windowFeatures);
});
