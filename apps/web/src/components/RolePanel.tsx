import type { PlayerRole, PlayerViewSnapshot } from "@codenames/shared";

const roleOptions: PlayerRole[] = [
  "host",
  "red_spymaster",
  "red_operatives",
  "blue_spymaster",
  "blue_operatives",
  "spectator",
];

interface RolePanelProps {
  snapshot: PlayerViewSnapshot;
  onAssignRole: (playerId: string, role: PlayerRole) => void;
}

export function RolePanel({ snapshot, onAssignRole }: RolePanelProps) {
  const isHost = snapshot.hostId === snapshot.selfId;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">房间成员</p>
          <h2>角色分配</h2>
        </div>
        <span className="room-code">{snapshot.roomId}</span>
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
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            ) : (
              <span className="pill">{player.role}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

