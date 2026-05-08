import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import type { CardOwner, GameMode, KeyCellState, PlayerRole, PlayerState, PlayerViewSnapshot, RoomConfig, TeamName, TeamSize } from "@codenames/shared";
import { findForbiddenClueText, socketEvents } from "@codenames/shared";

import { IconButton, icons } from "./components/IconButton";
import { PhaserBoardEffects } from "./components/PhaserBoardEffects";
import { useGsapEntrance } from "./hooks/useGsapEntrance";
import { playSound } from "./lib/audio";
import { getServerUrl, getSocket } from "./lib/socket";

const storageKey = "codenames-dealer:identity";

type StoredIdentity = Record<string, { playerId: string }>;
type HomeStep = "home" | "mode" | "headcount" | "join" | "guide";
type BoardTab = "public" | "key";
type HostInfo = { port: number; localUrl: string; lanUrls: string[] };

const nicknameParts = [
  "安然",
  "白露",
  "北辰",
  "北风",
  "碧云",
  "朝阳",
  "晨光",
  "晨星",
  "春晓",
  "翠竹",
  "大川",
  "丹青",
  "东篱",
  "飞白",
  "飞鸿",
  "飞雪",
  "风铃",
  "风眠",
  "风清",
  "观海",
  "光远",
  "海棠",
  "海蓝",
  "寒山",
  "和风",
  "红枫",
  "红叶",
  "华年",
  "怀安",
  "江南",
  "江月",
  "锦书",
  "静水",
  "旧桥",
  "可心",
  "兰舟",
  "朗月",
  "乐山",
  "黎明",
  "莲心",
  "林深",
  "流云",
  "绿竹",
  "落霞",
  "明河",
  "明朗",
  "明月",
  "墨白",
  "墨砚",
  "南风",
  "南山",
  "暖阳",
  "平湖",
  "青灯",
  "青禾",
  "青山",
  "青石",
  "清晨",
  "清风",
  "清河",
  "清欢",
  "秋水",
  "秋雨",
  "秋月",
  "如意",
  "山河",
  "山月",
  "少华",
  "疏雨",
  "双桥",
  "水光",
  "松风",
  "松月",
  "素心",
  "天青",
  "听风",
  "晚晴",
  "望舒",
  "微澜",
  "文清",
  "无忧",
  "西窗",
  "夏初",
  "夏木",
  "晓风",
  "晓月",
  "星辰",
  "星河",
  "星火",
  "星图",
  "星雨",
  "雪晴",
  "雪松",
  "烟雨",
  "雁回",
  "一帆",
  "一鸣",
  "一诺",
  "宜安",
  "映雪",
  "雨辰",
  "雨禾",
  "雨晴",
  "远山",
  "云帆",
  "云海",
  "云舒",
  "云溪",
  "长安",
  "朝露",
  "知行",
  "知夏",
  "竹影",
  "子安",
  "紫苏",
  "白帆",
  "半夏",
  "初晴",
  "春和",
  "春山",
  "春雨",
  "春舟",
  "东风",
  "芳草",
  "芳华",
  "归云",
  "海风",
  "海月",
  "和月",
  "花影",
  "嘉木",
  "嘉言",
  "锦年",
  "静安",
  "乐天",
  "林溪",
  "绿野",
  "明川",
  "明远",
  "木清",
  "南星",
  "宁川",
  "晴川",
  "晴岚",
  "清远",
  "秋禾",
  "若水",
  "山晴",
  "书晴",
  "书言",
  "松溪",
  "听雨",
  "温言",
  "西洲",
  "小满",
  "新雨",
  "星野",
  "雪桥",
  "雨安",
  "雨林",
  "月白",
  "月明",
  "云起",
  "知微",
  "竹青",
];
const teamSizeOptions: TeamSize[] = [4, 5, 6, 7, 8, 9, 10];

const modeLabels: Record<GameMode, string> = {
  text: "文字情报",
  image: "影像情报",
};

const ownerLabels: Record<CardOwner, string> = {
  red: "红队",
  blue: "蓝队",
  neutral: "平民",
  assassin: "刺客",
};

const ownerMarks: Record<CardOwner, string> = {
  red: "红",
  blue: "蓝",
  neutral: "民",
  assassin: "刺",
};

const teamLabels: Record<TeamName, string> = {
  red: "红队",
  blue: "蓝队",
};

function roleLabel(role: PlayerRole) {
  const labels: Record<PlayerRole, string> = {
    host: "房主",
    red_spymaster: "红队队长",
    red_operatives: "红队队员",
    blue_spymaster: "蓝队队长",
    blue_operatives: "蓝队队员",
    spectator: "旁观",
  };
  return labels[role];
}

function roleTeamLabel(role: PlayerRole) {
  if (role.startsWith("red_")) {
    return "红队";
  }
  if (role.startsWith("blue_")) {
    return "蓝队";
  }
  if (role === "host") {
    return "房主";
  }
  return "旁观";
}

function roleTeamClass(role: PlayerRole) {
  if (role.startsWith("red_")) {
    return "red";
  }
  if (role.startsWith("blue_")) {
    return "blue";
  }
  return "neutral";
}

function roleDutyLabel(role: PlayerRole) {
  if (role.endsWith("_spymaster")) {
    return "队长";
  }
  if (role.endsWith("_operatives")) {
    return "队员";
  }
  return role === "host" ? "房主" : "旁观";
}

function selfPlayer(snapshot: PlayerViewSnapshot) {
  return snapshot.players.find((player) => player.id === snapshot.selfId);
}

function activeSelfPrompt(snapshot: PlayerViewSnapshot) {
  const turn = snapshot.turn;
  if (!turn || turn.result || turn.phase === "ended" || turn.activePlayerId !== snapshot.selfId) {
    return null;
  }
  return turn.phase === "clue" ? "轮到你给线索" : "轮到你猜词";
}

function formatTimer(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function generateNickname() {
  return nicknameParts[Math.floor(Math.random() * nicknameParts.length)] ?? "灯塔";
}

function readIdentity(roomId: string) {
  const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as StoredIdentity;
  return parsed[roomId];
}

function saveIdentity(roomId: string, playerId: string) {
  const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as StoredIdentity;
  parsed[roomId] = { playerId };
  sessionStorage.setItem(storageKey, JSON.stringify(parsed));
}

function useDebouncedAction(delay = 180) {
  const lastRun = useRef(0);

  return useCallback(
    (action: () => void, tone: "tap" | "deal" | "score" | "danger" = "tap") => {
      const now = Date.now();
      if (now - lastRun.current < delay) {
        return;
      }
      lastRun.current = now;
      playSound(tone);
      action();
    },
    [delay],
  );
}

function useHostInfo() {
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${getServerUrl()}/host-info`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: HostInfo | null) => {
        if (active) {
          setHostInfo(payload);
        }
      })
      .catch(() => {
        if (active) {
          setHostInfo(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return hostInfo;
}

function openDemoWindow(roomId?: string) {
  const target = roomId ? `/?join=${roomId}` : "/";
  window.open(target, "_blank", "popup,width=430,height=900");
}

function boardColumns() {
  return 5;
}

function keyForCard(keyGrid: KeyCellState[] | null | undefined, cardId: string) {
  return keyGrid?.find((cell) => cell.cardId === cardId)?.owner;
}

function cardText(card: NonNullable<PlayerViewSnapshot["board"]>[number]) {
  return card.content.type === "word" ? card.content.text : card.content.alt;
}

function dealSignature(snapshot: PlayerViewSnapshot) {
  const started = [...snapshot.activityLog].reverse().find((entry) => entry.type === "game_started");
  if (started) {
    return started.id;
  }
  return snapshot.board?.map((card) => `${card.id}:${cardText(card)}`).join("|") ?? null;
}

function canViewKey(snapshot: PlayerViewSnapshot) {
  return Boolean(snapshot.keyGrid);
}

function nicknameFor(snapshot: PlayerViewSnapshot, playerId: string | null | undefined) {
  if (!playerId) {
    return "无人";
  }
  return snapshot.players.find((player) => player.id === playerId)?.nickname ?? "未知玩家";
}

function teamPlayers(snapshot: PlayerViewSnapshot, team: TeamName) {
  return snapshot.players.filter((player) => player.role === `${team}_spymaster` || player.role === `${team}_operatives`);
}

function playerMeta(snapshot: PlayerViewSnapshot, player: PlayerState) {
  const tags = [roleLabel(player.role), player.online ? "在线" : "离线"];
  if (snapshot.selfId === player.id) {
    tags.push("你");
  }
  if (snapshot.hostId === player.id) {
    tags.push("房主");
  }
  return [...new Set(tags)].join(" · ");
}

function HomePage() {
  const scopeRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const socket = getSocket();
  const hostInfo = useHostInfo();
  const [step, setStep] = useState<HomeStep>("home");
  const [nickname, setNickname] = useState(generateNickname);
  const [joinCode, setJoinCode] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("text");
  const [teamSize, setTeamSize] = useState<TeamSize>(4);
  const [error, setError] = useState("");
  const runAction = useDebouncedAction();
  useGsapEntrance(scopeRef, step);

  useEffect(() => {
    const roomToJoin = new URLSearchParams(window.location.search).get("join");
    if (roomToJoin) {
      setJoinCode(roomToJoin.toUpperCase());
      setStep("join");
    }
  }, []);

  useEffect(() => {
    function onSnapshot(snapshot: PlayerViewSnapshot) {
      saveIdentity(snapshot.roomId, snapshot.selfId);
      navigate(`/room/${snapshot.roomId}`);
    }

    function onError(payload: { message: string }) {
      setError(payload.message);
      playSound("danger");
    }

    socket.on(socketEvents.roomSnapshot, onSnapshot);
    socket.on(socketEvents.roomError, onError);
    return () => {
      socket.off(socketEvents.roomSnapshot, onSnapshot);
      socket.off(socketEvents.roomError, onError);
    };
  }, [navigate, socket]);

  function createRoom() {
    socket.emit(socketEvents.roomCreate, { nickname, config: { gameMode, teamSize } });
  }

  function joinRoom() {
    socket.emit(socketEvents.roomJoin, { roomId: joinCode.trim().toUpperCase(), nickname });
  }

  return (
    <Shell scopeRef={scopeRef}>
      {step === "guide" ? (
        <GuidePage onBack={() => runAction(() => setStep("home"))} />
      ) : (
        <>
          <TopBar
            label="游戏说明"
            actionLabel={nickname}
            onAction={() => runAction(() => setNickname(generateNickname()), "score")}
            onLabelClick={() => runAction(() => setStep("guide"))}
          />

          {step === "home" && (
            <section className="home-screen">
              <div className="hero-copy" data-animate="panel">
                <p className="eyebrow">Cinematic Party Game</p>
                <h1>行动代号</h1>
                <p className="caption">一语定线索，默契定胜负</p>
              </div>
              <MissionPreview />
              <div className="home-actions" data-animate="panel">
                <IconButton icon={icons.deal} label="创建任务" className="primary action-button" onClick={() => runAction(() => setStep("mode"), "deal")} />
                <IconButton icon={icons.key} label="加入房间" className="secondary action-button" onClick={() => runAction(() => setStep("join"))} />
              </div>
              <HostPanel hostInfo={hostInfo} compact />
            </section>
          )}

          {step === "mode" && (
            <section className="stack-screen">
              <ScreenTitle title="选择情报载体" />
              <div className="mode-list">
                <ModeCard active={gameMode === "text"} image="/mode-text.jpg" title="文字情报" note="5 x 5 中文词阵" onClick={() => runAction(() => setGameMode("text"), "score")} />
                <ModeCard active={gameMode === "image"} image="/mode-image.jpg" title="影像情报" note="5 x 5 图片任务牌" onClick={() => runAction(() => setGameMode("image"), "score")} />
              </div>
              <FooterNav back={() => runAction(() => setStep("home"))} next={() => runAction(() => setStep("headcount"))} />
            </section>
          )}

          {step === "headcount" && (
            <section className="stack-screen">
              <ScreenTitle title="配置行动小队" note="选择本局参与人数。" />
              <StatusCard label="当前模式" value={modeLabels[gameMode]} />
              <div className="headcount-grid" data-animate="panel">
                {teamSizeOptions.map((size) => (
                  <button key={size} type="button" className={`count-tile${teamSize === size ? " count-tile--active" : ""}`} onClick={() => runAction(() => setTeamSize(size), "score")} data-animate="card">
                    <span>{size}</span>
                  </button>
                ))}
              </div>
              <DeckCard />
              {error && <ErrorText message={error} />}
              <FooterNav back={() => runAction(() => setStep("mode"))} next={() => runAction(createRoom, "deal")} nextLabel="创建房间" />
            </section>
          )}

          {step === "join" && (
            <section className="stack-screen">
              <ScreenTitle title="接入行动频道" note="输入房主分享的房间码，加入后会自动恢复身份。" />
              <label className="input-field">
                <span>房间码</span>
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="E5NOM" maxLength={8} />
              </label>
              <label className="input-field">
                <span>代号昵称</span>
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="你的代号" maxLength={20} />
              </label>
              <GuideCard items={["房间码不区分大小写", "队长答案只在授权账号显示", "断线后会尝试恢复当前身份"]} />
              {error && <ErrorText message={error} />}
              <FooterNav back={() => runAction(() => setStep("home"))} next={() => runAction(joinRoom, "deal")} nextLabel="加入房间" nextDisabled={!joinCode.trim() || !nickname.trim()} />
            </section>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ children, scopeRef }: { children: React.ReactNode; scopeRef?: React.RefObject<HTMLElement | null> }) {
  return (
    <main className="app-stage">
      <section ref={scopeRef} className="app-shell">
        <div className="cinema-bg" />
        <div className="scanline" />
        {children}
      </section>
    </main>
  );
}

function TopBar({ label, actionLabel, onAction, onLabelClick }: { label: string; actionLabel: string; onAction: () => void; onLabelClick?: () => void }) {
  return (
    <header className="top-bar">
      {onLabelClick ? (
        <button type="button" className="signal-chip signal-chip--button" onClick={onLabelClick}>
          {label}
        </button>
      ) : (
        <span className="signal-chip">{label}</span>
      )}
      <IconButton icon={icons.refresh} label={actionLabel} className="ghost-button top-button" onClick={onAction} />
    </header>
  );
}

function GuidePage({ onBack }: { onBack: () => void }) {
  return (
    <section className="guide-screen">
      <IconButton icon={icons.back} label="返回" className="guide-back" onClick={onBack} />

      <div className="guide-hero" data-animate="panel">
        <img src="/deck-cover.jpg" alt="" />
        <div>
          <p className="eyebrow">Game Guide</p>
          <h1>游戏说明</h1>
          <p>队长用一个词连接多张牌，队员用默契找出己方目标，避开刺客。</p>
        </div>
      </div>

      <div className="guide-sections">
        <article className="guide-block" data-animate="card">
          <img src="/mode-text.jpg" alt="" />
          <div>
            <span>目标</span>
            <strong>先找完己方所有词牌</strong>
            <p>红蓝两队轮流行动。每队有一名队长，其余玩家为队员。队长知道每张牌的身份，队员只看公共牌阵。</p>
          </div>
        </article>
        <article className="guide-block" data-animate="card">
          <div className="guide-mini-grid" aria-hidden="true">
            <span className="preview-red">灯塔</span>
            <span>列车</span>
            <span className="preview-blue">星图</span>
            <span>港湾</span>
            <span className="preview-dark">密钥</span>
            <span>雪线</span>
          </div>
          <div>
            <span>队长</span>
            <strong>给出线索和数量</strong>
            <p>线索通常是一个词，数量表示队员可以联想到几张牌。不要说出牌面上的词，也不要暴露关键答案。</p>
          </div>
        </article>
        <article className="guide-block" data-animate="card">
          <img src="/mode-image.jpg" alt="" />
          <div>
            <span>队员</span>
            <strong>根据线索猜牌</strong>
            <p>点到己方牌可以继续猜；点到平民或对方牌会结束回合；点到刺客会立刻输掉本局。</p>
          </div>
        </article>
      </div>
    </section>
  );
}

function MissionPreview() {
  const cells = ["海港", "纸鹤", "灯塔", "星图", "密钥", "列车", "雪线", "罗盘", "黑曜石"];
  return (
    <div className="mission-preview" data-animate="panel" aria-hidden="true">
      <div className="radar-ring" />
      <div className="preview-grid">
        {cells.map((cell, index) => (
          <span key={cell} className={index % 5 === 0 ? "preview-red" : index % 4 === 0 ? "preview-dark" : index % 2 === 0 ? "preview-blue" : ""}>
            {cell}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-card" data-animate="panel">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DeckCard() {
  return (
    <div className="deck-card" data-animate="panel">
      <img src="/deck-cover.jpg" alt="" />
      <div>
        <span>牌库状态</span>
        <strong>本地情报牌库就绪</strong>
        <p>无 API Key 时仍可直接开局。</p>
      </div>
    </div>
  );
}

function GuideCard({ items }: { items: string[] }) {
  return (
    <aside className="guide-card" data-animate="panel">
      <span>行动提示</span>
      <ol>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </aside>
  );
}

function ScreenTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="screen-title" data-animate="panel">
      <p className="eyebrow">Mission Setup</p>
      <h1>{title}</h1>
      {note && <p className="caption">{note}</p>}
    </div>
  );
}

function HostPanel({ hostInfo, compact = false }: { hostInfo: HostInfo | null; compact?: boolean }) {
  const lanUrl = hostInfo?.lanUrls[0];
  const displayUrl = lanUrl ?? hostInfo?.localUrl ?? "开发服务器";
  const canCopy = Boolean(lanUrl ?? hostInfo?.localUrl);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setCopyState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyUrl() {
    if (!canCopy) {
      return;
    }
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopyState("copied");
      playSound("score");
    } catch {
      setCopyState("error");
      playSound("danger");
    }
  }

  return (
    <section className={compact ? "host-panel host-panel--compact" : "host-panel"} data-animate="panel">
      <div className="host-panel__body">
        <span>房主服务器</span>
        <div className="host-panel__url">
          <strong>{displayUrl}</strong>
          <IconButton icon={icons.copy} label={copyState === "copied" ? "已复制" : copyState === "error" ? "失败" : "复制"} className="secondary copy-button" disabled={!canCopy} onClick={copyUrl} />
        </div>
      </div>
    </section>
  );
}

function ModeCard({ active, image, title, note, onClick }: { active: boolean; image: string; title: string; note: string; onClick: () => void }) {
  return (
    <button type="button" className={`mode-card${active ? " mode-card--active" : ""}`} onClick={onClick} data-animate="card">
      <img src={image} alt="" />
      <span>{title}</span>
      <strong>{note}</strong>
    </button>
  );
}

function FooterNav({
  back,
  next,
  nextLabel = "下一步",
  nextDisabled = false,
}: {
  back: () => void;
  next: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <footer className="footer-nav">
      <IconButton icon={icons.back} label="返回" className="secondary action-button" onClick={back} />
      <IconButton icon={nextLabel === "创建房间" ? icons.deal : icons.magic} label={nextLabel} className="primary action-button" disabled={nextDisabled} onClick={next} />
    </footer>
  );
}

function ErrorText({ message }: { message: string }) {
  return <p className="error-text">{message}</p>;
}

function RoomPage() {
  const scopeRef = useRef<HTMLElement | null>(null);
  const { roomId = "" } = useParams();
  const socket = getSocket();
  const hostInfo = useHostInfo();
  const [snapshot, setSnapshot] = useState<PlayerViewSnapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<BoardTab>("public");
  const autoKeyDealRef = useRef<string | null>(null);
  const publicOverrideDealRef = useRef<string | null>(null);
  const runAction = useDebouncedAction();
  useGsapEntrance(scopeRef, `${snapshot?.phase ?? "loading"}-${tab}`);

  useEffect(() => {
    const identity = readIdentity(roomId);
    if (identity?.playerId) {
      socket.emit(socketEvents.roomRejoin, { roomId, playerId: identity.playerId });
    }

    function onSnapshot(next: PlayerViewSnapshot) {
      saveIdentity(next.roomId, next.selfId);
      setSnapshot(next);
      setError("");
      const signature = dealSignature(next);
      if (!next.keyGrid) {
        setTab("public");
        return;
      }
      if (signature && autoKeyDealRef.current !== signature && publicOverrideDealRef.current !== signature) {
        autoKeyDealRef.current = signature;
        setTab("key");
      }
    }

    function onError(payload: { message: string }) {
      setError(payload.message);
      playSound("danger");
    }

    socket.on(socketEvents.roomSnapshot, onSnapshot);
    socket.on(socketEvents.roomError, onError);
    return () => {
      socket.off(socketEvents.roomSnapshot, onSnapshot);
      socket.off(socketEvents.roomError, onError);
    };
  }, [roomId, socket]);

  if (!snapshot) {
    return (
      <Shell>
        <section className="loading-screen">
          <span className="loader-ring" />
          <p>正在恢复行动频道...</p>
          {error && <ErrorText message={error} />}
        </section>
      </Shell>
    );
  }

  const isHost = snapshot.hostId === snapshot.selfId;
  const onlineCount = snapshot.players.filter((player) => player.online).length;

  return (
    <Shell scopeRef={scopeRef}>
      <RoomHeader snapshot={snapshot} />

      {snapshot.phase === "lobby" ? (
        <WaitingRoom
          snapshot={snapshot}
          onlineCount={onlineCount}
          isHost={isHost}
          error={error}
          hostInfo={hostInfo}
          onStart={() => runAction(() => socket.emit(socketEvents.gameStart, { roomId }), "deal")}
          onUpdateConfig={(config) => socket.emit(socketEvents.roomUpdateConfig, { roomId, config })}
        />
      ) : (
        <BoardRoom
          snapshot={snapshot}
          tab={tab}
          setTab={(nextTab) =>
            runAction(() => {
              const signature = dealSignature(snapshot);
              if (signature) {
                publicOverrideDealRef.current = nextTab === "public" ? signature : null;
              }
              setTab(nextTab);
            })
          }
          isHost={isHost}
          error={error}
          onRestart={() => runAction(() => socket.emit(socketEvents.gameRestart, { roomId }), "deal")}
          onSubmitClue={(clue, count) => runAction(() => socket.emit(socketEvents.gameSubmitClue, { roomId, clue, count }), "score")}
          onGuessCard={(cardId) => runAction(() => socket.emit(socketEvents.gameGuessCard, { roomId, cardId }), "tap")}
          onEndTurn={() => runAction(() => socket.emit(socketEvents.gameEndTurn, { roomId }), "score")}
        />
      )}
    </Shell>
  );
}

function RoomHeader({ snapshot }: { snapshot: PlayerViewSnapshot }) {
  if (snapshot.phase === "lobby") {
    return (
      <header className="room-header">
        <div>
          <p className="eyebrow">Room Code</p>
          <h1>{snapshot.roomId}</h1>
        </div>
        <span className="status-pill">集结中</span>
      </header>
    );
  }

  const player = selfPlayer(snapshot);
  const activePrompt = activeSelfPrompt(snapshot);
  const role = player?.role ?? snapshot.selfRole;
  const teamClass = roleTeamClass(role);

  return (
    <header className="room-header room-header--player">
      <div className="player-identity">
        <p className="eyebrow">当前身份</p>
        <h1>{player?.nickname ?? "未知玩家"}</h1>
        <div className="identity-badges" aria-label={roleLabel(role)}>
          <span className={`identity-badge identity-badge--${teamClass}`}>{roleTeamLabel(role)}</span>
          <span className="identity-badge">{roleDutyLabel(role)}</span>
        </div>
      </div>
      <span className={`status-pill${activePrompt ? " status-pill--active" : ""}`}>{activePrompt ?? "已发牌"}</span>
    </header>
  );
}

function WaitingRoom({
  snapshot,
  onlineCount,
  isHost,
  error,
  hostInfo,
  onStart,
  onUpdateConfig,
}: {
  snapshot: PlayerViewSnapshot;
  onlineCount: number;
  isHost: boolean;
  error: string;
  hostInfo: HostInfo | null;
  onStart: () => void;
  onUpdateConfig: (config: Partial<RoomConfig>) => void;
}) {
  return (
    <section className="lobby-screen">
      <div className="lobby-stats" data-animate="panel">
        <StatusCard label="在线成员" value={`${onlineCount} / ${snapshot.config.teamSize}`} />
        <StatusCard label="行动模式" value={modeLabels[snapshot.config.gameMode]} />
      </div>
      <HostPanel hostInfo={hostInfo} />
      <IconButton icon={icons.demo} label="打开本机玩家窗口" className="secondary action-button full-width" onClick={() => {
        playSound();
        openDemoWindow(snapshot.roomId);
      }} />
      <div className="player-grid">
        {Array.from({ length: snapshot.config.teamSize }, (_, index) => {
          const player = snapshot.players[index];
          return (
            <article key={player?.id ?? index} className={`player-slot${player ? "" : " player-slot--empty"}`} data-animate="card">
              <img src="/avatar-agent.jpg" alt="" />
              <span>{player?.nickname ?? "邀请位"}</span>
              <small>{player ? playerMeta(snapshot, player) : "等待接入"}</small>
            </article>
          );
        })}
      </div>
      <div className="setting-row">
        <label className="input-field">
          <span>模式</span>
          <select disabled={!isHost} value={snapshot.config.gameMode} onChange={(event) => onUpdateConfig({ gameMode: event.target.value as GameMode })}>
            <option value="text">文字情报</option>
            <option value="image">影像情报</option>
          </select>
        </label>
        <label className="input-field">
          <span>人数</span>
          <select disabled={!isHost} value={snapshot.config.teamSize} onChange={(event) => onUpdateConfig({ teamSize: Number(event.target.value) as TeamSize })}>
            {teamSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} 人
              </option>
            ))}
          </select>
        </label>
      </div>
      <GuideCard items={["所有人到齐后由房主发牌", "开局后系统随机分配红蓝队和队长", "只有队长账号可见关键答案"]} />
      {error && <ErrorText message={error} />}
      <IconButton icon={icons.deal} label={isHost ? "开始发牌" : "等待房主发牌"} className="primary action-button full-width sticky-action" disabled={!isHost} onClick={onStart} />
    </section>
  );
}

function BoardRoom({
  snapshot,
  tab,
  setTab,
  isHost,
  error,
  onRestart,
  onSubmitClue,
  onGuessCard,
  onEndTurn,
}: {
  snapshot: PlayerViewSnapshot;
  tab: BoardTab;
  setTab: (tab: BoardTab) => void;
  isHost: boolean;
  error: string;
  onRestart: () => void;
  onSubmitClue: (clue: string, count: number) => void;
  onGuessCard: (cardId: string) => void;
  onEndTurn: () => void;
}) {
  const [clue, setClue] = useState("");
  const [count, setCount] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [dismissedResultSignature, setDismissedResultSignature] = useState<string | null>(null);
  const canSeeKey = canViewKey(snapshot);
  const cols = boardColumns();
  const cards = snapshot.board ?? [];
  const turn = snapshot.turn;
  const activeIsSelf = turn?.activePlayerId === snapshot.selfId;
  const canSubmitClue = activeIsSelf && turn?.phase === "clue";
  const canGuess = activeIsSelf && turn?.phase === "guess";
  const forbiddenClueText = useMemo(() => findForbiddenClueText(cards, clue), [cards, clue]);
  const deadlineTime = turn?.deadlineAt ? new Date(turn.deadlineAt).getTime() : null;
  const remainingMs = deadlineTime === null ? null : deadlineTime - now;
  const timeExpired = Boolean(turn && !turn.result && turn.phase !== "ended" && remainingMs !== null && remainingMs <= 0);
  const timerLabel = turn?.phase === "clue" ? "给线索" : turn?.phase === "guess" ? "猜词" : "已结束";
  const resultSignature = turn?.result ? `${turn.result.winner}-${turn.result.reason}-${turn.phaseStartedAt}` : null;
  const showResultModal = Boolean(turn?.result && resultSignature !== dismissedResultSignature);
  const redPlayers = teamPlayers(snapshot, "red");
  const bluePlayers = teamPlayers(snapshot, "blue");
  const keyCounts = useMemo(() => {
    const counts: Record<CardOwner, number> = { red: 0, blue: 0, neutral: 0, assassin: 0 };
    snapshot.keyGrid?.forEach((cell) => {
      counts[cell.owner] += 1;
    });
    return counts;
  }, [snapshot.keyGrid]);
  const scoreTotal = keyCounts.red + keyCounts.blue;
  const bannerText = turn?.result
    ? `${teamLabels[turn.result.winner]}获胜：${turn.result.reason === "assassin" ? "对手点中刺客" : "己方词牌全部揭示"}`
    : turn
      ? `${teamLabels[turn.currentTeam]}回合 · ${turn.phase === "clue" ? "队长给线索" : "队员猜词"} · 当前操作者 ${nicknameFor(snapshot, turn.activePlayerId)}`
      : "公共牌阵已部署。";
  const visibleBannerText = `${timeExpired ? "注意时间 · " : ""}${tab === "key" && canSeeKey ? "队长答案正在显示，请避免让队员看到屏幕。" : bannerText}`;

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [turn?.deadlineAt]);

  useEffect(() => {
    if (!resultSignature) {
      setDismissedResultSignature(null);
    }
  }, [resultSignature]);

  function submitCurrentClue() {
    const trimmed = clue.trim();
    if (!trimmed || forbiddenClueText) {
      return;
    }
    onSubmitClue(trimmed, count);
    setClue("");
  }

  return (
    <section className="board-screen">
      <PhaserBoardEffects cards={cards} keyCounts={keyCounts} mode={tab} triggerId={`${snapshot.roomId}-${snapshot.updatedAt}-${tab}`} />
      <div className={`feedback-banner${tab === "key" ? " feedback-banner--danger" : ""}${timeExpired ? " feedback-banner--time" : ""}`} role="status" data-animate="panel">
        <span className="pulse-dot" />
        {visibleBannerText}
      </div>
      <div className="tab-row" data-animate="panel">
        <IconButton icon={icons.game} label="公共牌阵" className={tab === "public" ? "tab-button tab-button--active" : "tab-button"} onClick={() => setTab("public")} />
        <IconButton icon={icons.key} label="关键答案" className={tab === "key" ? "tab-button tab-button--active" : "tab-button"} disabled={!canSeeKey} onClick={() => setTab("key")} />
      </div>

      <section className="turn-panel" data-animate="panel">
        <div className="turn-score">
          <span className="score-chip score-chip--red">红 {turn?.remainingByTeam.red ?? 0}</span>
          <span className="score-chip score-chip--blue">蓝 {turn?.remainingByTeam.blue ?? 0}</span>
          <span className="score-chip">剩余猜测 {turn?.remainingGuesses ?? 0}</span>
        </div>
        {turn && turn.phase !== "ended" && (
          <div className={`turn-timer${timeExpired ? " turn-timer--expired" : ""}`} aria-live="polite">
            <span>{timerLabel}</span>
            <strong>{timeExpired ? "注意时间" : remainingMs === null ? "--:--" : formatTimer(remainingMs)}</strong>
          </div>
        )}
        <div className="team-strip">
          <TeamRoster label="红队" players={redPlayers} snapshot={snapshot} />
          <TeamRoster label="蓝队" players={bluePlayers} snapshot={snapshot} />
        </div>
        {turn?.clue && (
          <p className="clue-line">
            线索 <strong>{turn.clue.text}</strong> / {turn.clue.count}
          </p>
        )}
        {turn?.phase === "clue" && (
          <div className="clue-entry">
            <div className="clue-form">
              <input value={clue} onChange={(event) => setClue(event.target.value)} placeholder={canSubmitClue ? "输入线索" : `等待 ${nicknameFor(snapshot, turn.activePlayerId)} 给线索`} maxLength={20} disabled={!canSubmitClue} />
              <input className="count-input" type="number" min={0} max={9} value={count} onChange={(event) => setCount(Math.max(0, Math.min(9, Number(event.target.value) || 0)))} disabled={!canSubmitClue} />
              <IconButton icon={icons.key} label="提交" className="primary small-button" disabled={!canSubmitClue || !clue.trim() || Boolean(forbiddenClueText)} onClick={submitCurrentClue} />
            </div>
            {canSubmitClue && forbiddenClueText && <p className="clue-warning">线索不能包含牌阵文字：{forbiddenClueText}</p>}
          </div>
        )}
        {turn?.phase === "guess" && (
          <div className="guess-actions">
            <span>{canGuess ? "选择一张公共牌，或结束回合。" : `等待 ${nicknameFor(snapshot, turn.activePlayerId)} 猜词`}</span>
            <IconButton icon={icons.back} label="结束回合" className="secondary small-button" disabled={!canGuess} onClick={onEndTurn} />
          </div>
        )}
      </section>

      {tab === "key" && canSeeKey ? (
        <div className="key-wrap">
          <div className="key-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {cards.map((card) => {
              const owner = keyForCard(snapshot.keyGrid, card.id) ?? "neutral";
              return (
                <div key={card.id} className={`key-cell key-cell--${owner}`} data-mark={ownerMarks[owner]} data-animate="card">
                  <span>{cardText(card)}</span>
                </div>
              );
            })}
          </div>
          <div className="key-legend">
            <span className="score-chip score-chip--red">红 {keyCounts.red}</span>
            <span className="score-chip score-chip--blue">蓝 {keyCounts.blue}</span>
            <span className="score-chip">白 {keyCounts.neutral}</span>
            <span className="score-chip score-chip--danger">黑 {keyCounts.assassin}</span>
          </div>
          <div className="score-meter" aria-label={`答案计分，红蓝共 ${scoreTotal} 张`}>
            <div style={{ width: `${scoreTotal ? (keyCounts.red / scoreTotal) * 100 : 50}%` }} />
          </div>
        </div>
      ) : (
        <div className={`card-grid card-grid--${snapshot.config.gameMode}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cards.map((card) => (
            <button key={card.id} type="button" className={`public-card${card.revealedOwner ? ` public-card--${card.revealedOwner}` : ""}`} disabled={!canGuess || Boolean(card.revealedOwner)} onClick={() => onGuessCard(card.id)} data-animate="card">
              {card.content.type === "word" ? (
                <span>{card.content.text}</span>
              ) : (
                <>
                  <img src={card.content.imageUrl} alt={card.content.alt} />
                  <small>{card.content.alt}</small>
                </>
              )}
              {card.revealedOwner && <em>{ownerLabels[card.revealedOwner]}</em>}
            </button>
          ))}
        </div>
      )}

      <footer className="board-footer">
        <span>{canSeeKey ? "队长答案仅当前账号可见" : "队员视图不显示答案"}</span>
        <IconButton icon={icons.refresh} label="再发一局" className="secondary action-button compact-action" disabled={!isHost} onClick={onRestart} />
      </footer>
      {showResultModal && turn?.result && (
        <ResultModal
          result={turn.result}
          isHost={isHost}
          onClose={() => setDismissedResultSignature(resultSignature)}
          onRestart={() => {
            setDismissedResultSignature(resultSignature);
            onRestart();
          }}
        />
      )}
      {error && <ErrorText message={error} />}
    </section>
  );
}

function ResultModal({ result, isHost, onClose, onRestart }: { result: NonNullable<PlayerViewSnapshot["turn"]>["result"]; isHost: boolean; onClose: () => void; onRestart: () => void }) {
  if (!result) {
    return null;
  }
  const isAssassin = result.reason === "assassin";
  const reasonText = isAssassin ? "对手点中刺客" : "己方词牌全部揭示";
  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-label="本局结算">
      <section className={`result-modal result-modal--${isAssassin ? "assassin" : result.winner}`}>
        <p className="eyebrow">Mission Complete</p>
        <h2>{teamLabels[result.winner]}获胜</h2>
        <p>{reasonText}</p>
        <div className="result-actions">
          <IconButton icon={icons.game} label="查看牌阵" className="secondary action-button" onClick={onClose} />
          {isHost && <IconButton icon={icons.refresh} label="再发一局" className="primary action-button" onClick={onRestart} />}
        </div>
      </section>
    </div>
  );
}

function TeamRoster({ label, players, snapshot }: { label: string; players: PlayerState[]; snapshot: PlayerViewSnapshot }) {
  return (
    <div className="team-roster">
      <strong>{label}</strong>
      <span>{players.map((player) => `${player.nickname}${snapshot.selfId === player.id ? "(你)" : ""}`).join("、")}</span>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
