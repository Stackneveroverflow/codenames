import type { PlayerViewSnapshot } from "@codenames/shared";

import { getServerUrl } from "../lib/socket";

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
            {card.content.type === "word" ? <span>{card.content.text}</span> : <img className="card__image" src={imageSrc(card.content.imageUrl)} alt={card.content.alt || "图牌"} />}
          </article>
        ))}
      </div>
    </section>
  );
}

function imageSrc(imageUrl: string) {
  if (imageUrl.startsWith("/generated-cards/")) {
    return `${getServerUrl()}${imageUrl}`;
  }
  return imageUrl;
}
