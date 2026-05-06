import type { PlayerViewSnapshot, VisibleCardState } from "@codenames/shared";

interface BoardProps {
  snapshot: PlayerViewSnapshot;
  onGuess: (cardId: string) => void;
}

function cardClass(card: VisibleCardState, gameMode: PlayerViewSnapshot["config"]["gameMode"]) {
  if (!card.revealed) {
    return `card card--${gameMode}`;
  }
  return `card card--${card.owner ?? "neutral"}`;
}

export function Board({ snapshot, onGuess }: BoardProps) {
  const canGuess =
    snapshot.phase === "in_round" &&
    snapshot.turn?.phase === "guess" &&
    ((snapshot.turn.team === "red" && snapshot.selfRole === "red_operatives") ||
      (snapshot.turn.team === "blue" && snapshot.selfRole === "blue_operatives"));

  return (
    <section className="board-section">
      <div className="board-header">
        <div>
          <p className="eyebrow">牌盘</p>
          <h2>5 x 5 情报卡</h2>
        </div>
        <div className={`view-badge view-badge--${snapshot.selfRole.includes("spymaster") ? "master" : "field"}`}>
          {snapshot.selfRole.includes("spymaster") ? "队长视图" : "队员视图"}
        </div>
      </div>
      <div className="board-grid">
        {snapshot.board?.map((card) => (
          <button
            key={card.id}
            className={cardClass(card, snapshot.config.gameMode)}
            disabled={card.revealed || !canGuess}
            onClick={() => onGuess(card.id)}
            type="button"
          >
            {card.content.type === "word" ? (
              <span>{card.content.text}</span>
            ) : (
              <img className="card__image" src={card.content.imageUrl} alt={card.content.alt} />
            )}
            {card.owner && <small>{card.owner === "neutral" ? "中立" : card.owner === "assassin" ? "刺客" : `${card.owner}队`}</small>}
          </button>
        ))}
      </div>
    </section>
  );
}
