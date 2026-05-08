import type { PlayerRole, PlayerViewSnapshot } from "@codenames/shared";

const roleOptions: PlayerRole[] = [
  "host",
  "red_spymaster",
  "red_operatives",
  "blue_spymaster",
  "blue_operatives",
  "spectator",
];

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

interface RolePanelProps {
  snapshot: PlayerViewSnapshot;
  onAssignRole: (playerId: string, role: PlayerRole) => void;
}

export function RolePanel({ snapshot, onAssignRole }: RolePanelProps) {
  const isHost = snapshot.hostId === snapshot.selfId;
  const redCount = snapshot.players.filter((player) => player.role === "red_spymaster" || player.role === "red_operatives").length;
  const blueCount = snapshot.players.filter((player) => player.role === "blue_spymaster" || player.role === "blue_operatives").length;

  function isRoleDisabled(role: PlayerRole, currentRole: PlayerRole) {
    if (role === currentRole) {
      return false;
    }
    if (role === "red_spymaster" || role === "red_operatives") {
      return redCount >= snapshot.config.teamSize;
    }
    if (role === "blue_spymaster" || role === "blue_operatives") {
      return blueCount >= snapshot.config.teamSize;
    }
    return false;
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">房间成员</p>
          <h2>角色分配</h2>
        </div>
        <div className="room-meta">
          <span className="room-code">{snapshot.roomId}</span>
          <span className="pill">红队 {redCount}/{snapshot.config.teamSize}</span>
          <span className="pill">蓝队 {blueCount}/{snapshot.config.teamSize}</span>
        </div>
      </div>
      <div className="player-list">
        {snapshot.players.map((player) => (
          <div key={player.id} className="player-row">
            <div>
              <strong>{player.nickname}</strong>
              <p>
                {player.online ? "在线" : "离线"}
                {snapshot.hostId === player.id ? " · 房主" : ""}
              </p>
            </div>
            {isHost ? (
              <select value={player.role} onChange={(event) => onAssignRole(player.id, event.target.value as PlayerRole)}>
                {roleOptions.map((role) => (
                  <option key={role} value={role} disabled={isRoleDisabled(role, player.role)}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="pill">{roleLabel(player.role)}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
