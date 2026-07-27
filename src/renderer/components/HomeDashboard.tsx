import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Crown,
  History,
  Layers3,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  type LucideIcon
} from "lucide-react";
import type { LadderDeckRecommendationResult } from "../../shared/ladderDeckRecommendation";
import type { MatchHistoryResult, PublicTrackerState } from "../../shared/types";
import { toDashboardViewModel, type DashboardEventView } from "../dashboardView";

export interface HomeDashboardProps {
  readonly state: PublicTrackerState;
  readonly matchHistory?: MatchHistoryResult;
  readonly matchHistoryLoading?: boolean;
  readonly matchHistoryError?: string;
  readonly ladderRecommendation?: LadderDeckRecommendationResult;
  readonly onCopyLadderDeckCode?: (deckCode: string) => Promise<void>;
  readonly onOpenTracker?: () => void;
}

const heroImageUrl = new URL("../assets/hearthstone-hero-gold.png", import.meta.url).href;
const editorialImageUrl = new URL("../assets/hearthstone-hero.png", import.meta.url).href;
const resultLabels = { win: "胜利", loss: "失败", tie: "平局" } as const;
const matchModeLabels = {
  standard: "标准",
  wild: "狂野",
  arena: "竞技场",
  unknown: "未知模式"
} as const;
const trackerModeLabels = { ladder: "天梯", arena: "竞技场" } as const;
const curatedStories = [
  {
    id: "secret-guide",
    category: "实战指南",
    title: "奥秘预测应该怎么看",
    summary: "候选牌会随着对手行动逐步排除。优先关注仍保持高亮、且会影响当前回合操作的奥秘。",
    meta: "本地精选 · 3 分钟"
  },
  {
    id: "arena-guide",
    category: "竞技场",
    title: "评分不是唯一答案",
    summary: "评分适合判断单卡强度，后半段还要结合费用曲线、解场数量和获胜方式。",
    meta: "本地精选 · 4 分钟"
  },
  {
    id: "tracker-guide",
    category: "使用技巧",
    title: "让记牌器保持准确",
    summary: "进入炉石后保持日志监听开启。切换套牌时等待窗口确认套牌名称，再开始对局。",
    meta: "本地精选 · 2 分钟"
  }
] as const;

type CopyState = "idle" | "copying" | "copied" | "error";

function formatHistoryWinRate(winRate: number | undefined): string {
  if (winRate === undefined) return "暂无";
  const percentage = winRate >= 0 && winRate <= 1 ? winRate * 100 : winRate;
  return `${percentage.toFixed(1)}%`;
}

export function HomeDashboard({
  state,
  matchHistory,
  matchHistoryLoading = false,
  matchHistoryError,
  ladderRecommendation,
  onCopyLadderDeckCode,
  onOpenTracker
}: HomeDashboardProps) {
  const dashboard = toDashboardViewModel(state, matchHistory, ladderRecommendation);
  const recentEvents = dashboard.events.items.slice(-3).reverse();
  const ladderReady = dashboard.ladder.state === "ready" && Boolean(dashboard.ladder.recommendation);
  const hero = getHeroCopy(state);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    setCopyState("idle");
  }, [dashboard.ladder.recommendation?.deckCode]);

  async function copyDeckCode() {
    const deckCode = dashboard.ladder.recommendation?.deckCode;
    if (!deckCode || !onCopyLadderDeckCode || copyState === "copying") return;
    setCopyState("copying");
    try {
      await onCopyLadderDeckCode(deckCode);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section
      className={`home-dashboard home-dashboard-grid home-newsroom${ladderReady ? "" : " is-ladder-unavailable"}`}
      aria-label="首页"
    >
      <header className={`home-newsroom-hero status-${state.status}`}>
        <img className="home-newsroom-hero-image" src={heroImageUrl} alt="" />
        <div className="home-newsroom-hero-shade" />
        <div className="home-newsroom-hero-copy">
          <span className="home-newsroom-kicker">
            <Radio aria-hidden="true" size={14} />
            {getStatusLabel(state)}
          </span>
          <h1>{hero.title}</h1>
          <p>{hero.detail}</p>
          <div className="home-newsroom-hero-actions">
            {onOpenTracker ? (
              <button type="button" className="home-primary-action" onClick={onOpenTracker}>
                进入实时对局
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            ) : null}
            <span className="home-local-badge">
              <ShieldCheck aria-hidden="true" size={14} />
              数据仅保存在本机
            </span>
          </div>
        </div>
        <aside className="home-newsroom-status-card" aria-label="当前记录状态">
          <div className="home-status-card-heading">
            <span className={`home-status-dot is-${state.status}`} aria-hidden="true" />
            <div>
              <small>实时记录</small>
              <strong>{dashboard.activity.currentLabel}</strong>
            </div>
          </div>
          <dl className="home-status-card-facts">
            <Fact label="当前套牌" value={state.deckName?.trim() || "尚未识别"} />
            <Fact label="当前模式" value={state.trackerMode ? trackerModeLabels[state.trackerMode] : "尚未识别"} />
            <Fact label="牌库剩余" value={`${dashboard.deck.remainingCards} 张`} />
            <Fact label="本局已抽" value={`${dashboard.deck.drawnCards} 张`} />
          </dl>
        </aside>
      </header>

      <div className="home-newsroom-layout">
        <main className="home-editorial-column">
          <section className="home-featured-story" aria-labelledby="featured-story-title">
            <div className="home-section-heading">
              <div>
                <span>LOCAL EDITION</span>
                <h2 id="featured-story-title">本地精选</h2>
              </div>
              <Sparkles aria-hidden="true" size={19} />
            </div>
            <article className="home-featured-story-card">
              <img src={editorialImageUrl} alt="" />
              <div className="home-featured-story-copy">
                <span>{curatedStories[0].category}</span>
                <h3>{curatedStories[0].title}</h3>
                <p>{curatedStories[0].summary}</p>
                <small>{curatedStories[0].meta}</small>
              </div>
              <BookOpen aria-hidden="true" size={38} />
            </article>
          </section>

          <section className="home-curated-grid" aria-label="精选内容">
            {curatedStories.slice(1).map((story) => (
              <article key={story.id} className="home-curated-card">
                <span>{story.category}</span>
                <h3>{story.title}</h3>
                <p>{story.summary}</p>
                <small>{story.meta}</small>
              </article>
            ))}
          </section>

          <DashboardPanel className="home-live-panel" title="游戏动态" icon={Activity}>
            <div className="home-live-status">
              <span className={`home-status-dot is-${state.status}`} aria-hidden="true" />
              <div>
                <small>当前状态</small>
                <strong>
                  {dashboard.arena.state === "ready" &&
                  (dashboard.arena.status === "drafting" || dashboard.arena.status === "redrafting")
                    ? `竞技场${dashboard.arena.statusLabel}`
                    : dashboard.activity.currentLabel}
                </strong>
                {state.gameActive &&
                dashboard.arena.state === "ready" &&
                (dashboard.arena.status === "drafting" || dashboard.arena.status === "redrafting") ? (
                  <span>{dashboard.activity.currentLabel}</span>
                ) : null}
                <span>
                  {state.gameActive
                    ? `牌库剩余 ${dashboard.deck.remainingCards} 张，已抽 ${dashboard.deck.drawnCards} 张`
                    : dashboard.arena.state === "ready" &&
                        (dashboard.arena.status === "drafting" || dashboard.arena.status === "redrafting")
                      ? `已确认 ${dashboard.arena.confirmedCount ?? 0} 张 · 待识别 ${dashboard.arena.unresolvedCount ?? 0} 张`
                      : "尚无进行中的对局"}
                </span>
              </div>
            </div>
            {!ladderReady ? (
              <p className="home-inline-note">
                天梯推荐：{dashboard.ladder.message ?? "当前没有可用的可信数据。"}
              </p>
            ) : null}
            <RecentActivity
              loading={matchHistoryLoading}
              error={matchHistoryError}
              recentMatch={dashboard.activity.recentMatch}
              historyMessage={dashboard.activity.historyMessage}
              recentEvents={recentEvents}
            />
          </DashboardPanel>
        </main>

        <aside className="home-insight-column">
          {ladderReady && dashboard.ladder.recommendation ? (
            <DashboardPanel className="home-ladder-panel" title="天梯推荐" icon={Trophy}>
              <div className="home-ladder-ready">
                <div className="home-ladder-heading">
                  <div>
                    <small>
                      {dashboard.ladder.recommendation.mode === "standard" ? "标准" : "狂野"}
                      {" · "}
                      {dashboard.ladder.recommendation.className}
                    </small>
                    <strong>{dashboard.ladder.recommendation.name}</strong>
                  </div>
                  {dashboard.ladder.stale ? <em>缓存数据</em> : null}
                </div>
                <dl className="home-ladder-stats">
                  <Stat label="胜率" value={`${dashboard.ladder.recommendation.winRate.toFixed(1)}%`} />
                  <Stat label="统计场次" value={dashboard.ladder.recommendation.games.toLocaleString("zh-CN")} />
                </dl>
                <div className="home-ladder-source">
                  <span>{dashboard.ladder.recommendation.source.name}</span>
                  <span>版本 {dashboard.ladder.gameVersion ?? dashboard.ladder.recommendation.patch}</span>
                </div>
                {copyState === "error" ? <p className="home-copy-error" role="alert">复制失败，请重试。</p> : null}
                <button
                  type="button"
                  className="home-copy-deck"
                  disabled={!onCopyLadderDeckCode || copyState === "copying"}
                  onClick={() => void copyDeckCode()}
                  aria-label={copyState === "copied" ? "已复制卡组代码" : "复制卡组代码"}
                >
                  {copyState === "copied" ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
                  {copyState === "copied" ? "已复制" : copyState === "copying" ? "复制中" : "复制卡组代码"}
                </button>
              </div>
            </DashboardPanel>
          ) : null}

          {!matchHistoryLoading && !matchHistoryError && dashboard.history.state !== "error" ? (
            <DashboardPanel className="home-history-panel" title="对局记录" icon={History}>
              {dashboard.history.state === "ready" ? (
              <dl className="home-history-summary">
                <Stat label="总对局" value={dashboard.history.total ?? 0} />
                <Stat label="胜率" value={formatHistoryWinRate(dashboard.history.winRate)} />
                <Stat label="胜利" value={dashboard.history.wins ?? 0} />
                <Stat label="失败" value={dashboard.history.losses ?? 0} />
              </dl>
              ) : (
                <EmptyState>{dashboard.history.message}</EmptyState>
              )}
            </DashboardPanel>
          ) : null}
        </aside>
      </div>

      <div className="home-newsroom-footer-grid">
        <DashboardPanel className="home-deck-panel" title="当前套牌" icon={Layers3}>
          {dashboard.deck.state === "ready" ? (
            <div className="home-deck-ready">
              <div className="home-deck-heading">
                <strong>{dashboard.deck.name ?? "未命名套牌"}</strong>
                <span>{`牌库剩余${dashboard.deck.remainingCards}`}</span>
              </div>
              <dl className="home-deck-stats">
                <Stat label="总牌数" value={dashboard.deck.totalCards} />
                <Stat label="剩余" value={dashboard.deck.remainingCards} />
                <Stat label="已抽" value={dashboard.deck.drawnCards} />
              </dl>
              {dashboard.deck.cards.length ? (
                <ul className="home-deck-list">
                  {dashboard.deck.cards.slice(0, 4).map((card) => (
                    <li key={card.id}>
                      <span>{card.name}</span>
                      <strong>×{card.remaining}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <EmptyState>{dashboard.deck.message}</EmptyState>
          )}
        </DashboardPanel>

        <DashboardPanel className="home-arena-panel" title="竞技场概览" icon={Crown}>
          {dashboard.arena.state === "ready" ? (
            <dl className="home-arena-details">
              <Detail label="当前状态" value={dashboard.arena.statusLabel ?? "状态未知"} />
              <Detail label="英雄" value={dashboard.arena.hero ?? "尚未识别英雄"} />
              <Detail label="选牌进度" value={`已确认 ${dashboard.arena.confirmedCount ?? 0} 张`} />
              <Detail label="待识别" value={`${dashboard.arena.unresolvedCount ?? 0} 张`} />
              <Detail label="评分来源" value={dashboard.arena.scoreSource ?? "暂无评分来源"} />
            </dl>
          ) : (
            <EmptyState alert={dashboard.arena.state === "error"}>{dashboard.arena.message}</EmptyState>
          )}
        </DashboardPanel>
      </div>
    </section>
  );
}

function RecentActivity({
  loading,
  error,
  recentMatch,
  historyMessage,
  recentEvents
}: {
  loading: boolean;
  error?: string;
  recentMatch?: ReturnType<typeof toDashboardViewModel>["activity"]["recentMatch"];
  historyMessage?: string;
  recentEvents: readonly DashboardEventView[];
}) {
  if (loading) return <EmptyState>正在读取最近完成的对局…</EmptyState>;
  if (error) return <EmptyState alert>{error}</EmptyState>;
  if (recentMatch) {
    return (
      <div className="home-recent-match">
        <small><History aria-hidden="true" size={13} />最近完成</small>
        <div className="home-recent-match-row">
          <span className={`home-match-result is-${recentMatch.result}`}>{resultLabels[recentMatch.result]}</span>
          <strong>{recentMatch.deckName ?? "未识别套牌"}</strong>
          <span>{matchModeLabels[recentMatch.mode]}</span>
          <time dateTime={recentMatch.endedAt}>{formatLocalTime(recentMatch.endedAt)}</time>
        </div>
      </div>
    );
  }
  if (recentEvents.length) {
    return (
      <div className="home-recent-match">
        <small><Activity aria-hidden="true" size={13} />最近事件</small>
        <ul className="home-recent-events">
          {recentEvents.map((event) => (
            <li key={event.id}><time>{event.at}</time><span>{formatEvent(event)}</span></li>
          ))}
        </ul>
      </div>
    );
  }
  return <EmptyState>{historyMessage ?? "还没有可展示的对局动态。"}</EmptyState>;
}

function DashboardPanel({
  className,
  title,
  icon: Icon,
  children
}: {
  className: string;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <article className={`home-dashboard-panel dashboard-panel ${className}`} aria-label={title}>
      <header><Icon aria-hidden="true" size={17} /><h2>{title}</h2></header>
      <div className="home-dashboard-panel-body">{children}</div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>;
}

function EmptyState({ alert = false, children }: { alert?: boolean; children?: React.ReactNode }) {
  return <p className="home-empty-state" role={alert ? "alert" : "status"}>{children}</p>;
}

function getStatusLabel(state: PublicTrackerState): string {
  if (state.status === "watching") return state.gameActive ? "对局进行中" : "日志正常";
  if (state.status === "paused") return "已暂停";
  if (state.status === "missing-log") return "日志未就绪";
  if (state.status === "error") return "读取异常";
  return "等待开始";
}

function getHeroCopy(state: PublicTrackerState): { title: string; detail: string } {
  if (state.status === "missing-log") {
    return { title: "需要完成日志设置", detail: state.error ?? "修复日志后，完全退出并重新打开炉石，再进入一局。" };
  }
  if (state.status === "error") {
    return { title: "日志读取遇到问题", detail: state.error ?? "检查日志路径后重试。" };
  }
  if (state.status === "paused") {
    return { title: "监听已暂停", detail: "恢复监听后会继续记录真实对局。" };
  }
  if (state.status === "watching" && state.gameActive) {
    return {
      title: "对局正在记录",
      detail: `牌库剩余 ${state.summary.remainingCards} 张，已抽 ${state.summary.drawnCards} 张。`
    };
  }
  if (state.status === "watching") {
    return { title: "已识别炉石，等待开局", detail: "进入对局后会自动开始记牌。" };
  }
  return { title: "准备记录下一局", detail: "开始监听后，这里会显示真实对局数据。" };
}

function formatLocalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatEvent(event: DashboardEventView): string {
  if (event.kind === "draw") return event.cardName ? `抽到${event.cardName}` : "抽到一张牌";
  if (event.kind === "friendly-play") return event.cardName ? `我方打出${event.cardName}` : "我方打出一张牌";
  if (event.kind === "opponent-play") return event.cardName ? `对手打出${event.cardName}` : "对手打出一张牌";
  if (event.kind === "arena-pick") return event.cardName ? `竞技场选择${event.cardName}` : "竞技场完成一次选择";
  if (event.kind === "game-start") return "对局开始";
  if (event.kind === "game-end") return "对局结束";
  return event.cardName ?? "对局状态已更新";
}
