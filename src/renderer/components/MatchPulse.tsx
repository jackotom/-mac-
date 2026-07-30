import type { MatchPulseView } from "../types";

export function MatchPulse({
  pulse,
  variant
}: {
  readonly pulse?: MatchPulseView;
  readonly variant: "full" | "compact" | "actor";
}) {
  const label = variant === "full"
    ? pulse?.fullLabel
    : variant === "compact"
      ? pulse?.compactLabel
      : pulse?.actorLabel;
  if (!label) return null;

  return (
    <div
      className={`match-pulse match-pulse-${variant}`}
      aria-label={variant === "actor" ? "当前行动方" : "当前对局进程"}
      title={variant === "actor" ? label : pulse?.fullLabel ?? label}
    >
      {label}
    </div>
  );
}
