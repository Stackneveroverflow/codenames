import type { PlayerViewSnapshot } from "@codenames/shared";

export function ActivityLog({ snapshot }: { snapshot: PlayerViewSnapshot }) {
  return (
    <section className="panel panel--activity">
      <div className="panel-header">
        <div>
          <p className="eyebrow">事件流</p>
          <h2>现场记录</h2>
        </div>
      </div>
      <div className="activity-list">
        {[...snapshot.activityLog].reverse().map((entry) => (
          <article key={entry.id} className="activity-item">
            <time>{new Date(entry.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
            <p>{entry.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

