import type { PlayerViewSnapshot } from "@codenames/shared";

interface BoardProps {
  snapshot: PlayerViewSnapshot;
  compact?: boolean;
}

export function Board({ snapshot, compact = false }: BoardProps) {
  return (
    <section className={`board-section${compact ? " board-section--compact" : ""}`}>
      <div className="board-grid">
        {snapshot.board?.map((card) => (
          <article key={card.id} className="card">
            {card.content.type === "word" ? <span>{card.content.text}</span> : <img className="card__image" src={card.content.imageUrl} alt={card.content.alt} />}
          </article>
        ))}
      </div>
    </section>
  );
}
