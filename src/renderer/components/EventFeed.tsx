import { Activity, AlertTriangle, Eye, Hand, History, Swords } from "lucide-react";
import type { GameEvent, GameEventKind } from "../types";

interface EventFeedProps {
  events: GameEvent[];
}

const eventIconByKind: Record<GameEventKind, typeof Activity> = {
  draw: Hand,
  play: Swords,
  mulligan: History,
  secret: Eye,
  turn: Activity,
  log: Activity,
  warning: AlertTriangle
};

const actorLabels: Record<GameEvent["actor"], string> = {
  me: "我方",
  opponent: "对手",
  system: "系统"
};

export function EventFeed({ events }: EventFeedProps) {
  return (
    <main className="panel event-feed" aria-label="实时事件流">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">实时事件流</span>
          <h2>本局动态</h2>
        </div>
        <span className="event-count">{events.length} 条</span>
      </div>

      {events.length === 0 ? (
        <div className="empty-state" role="status">
          <Activity aria-hidden="true" size={18} />
          <strong>等待对局日志</strong>
          <span>开始监听并进入一局后，抽牌和出牌会显示在这里。</span>
        </div>
      ) : (
        <ol className="timeline">
          {events.map((event) => {
            const EventIcon = eventIconByKind[event.kind];

            return (
              <li className={`timeline-row actor-${event.actor}`} key={event.id}>
                <div className="timeline-icon">
                  <EventIcon aria-hidden="true" size={17} />
                </div>
                <article>
                  <div className="timeline-meta">
                    <span>回合 {event.turn}</span>
                    <span>{event.timestamp}</span>
                    <span>{actorLabels[event.actor]}</span>
                  </div>
                  <h3>{event.title}</h3>
                  <p>{event.detail}</p>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
