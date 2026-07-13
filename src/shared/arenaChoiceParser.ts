import { parseEntity } from "./powerLogParser.js";
import type { ArenaCardChoice } from "./types.js";

export type ArenaPowerChoiceEvent =
  | {
      readonly type: "offered";
      readonly choiceId: string;
      readonly offered: readonly ArenaCardChoice[];
    }
  | {
      readonly type: "completed";
      readonly choiceId: string;
      readonly offered: readonly ArenaCardChoice[];
      readonly chosen: readonly ArenaCardChoice[];
    };

interface ChoiceBuffer {
  readonly id: string;
  offered: ArenaCardChoice[];
  chosen: ArenaCardChoice[];
  offeredEmitted: boolean;
  completedEmitted: boolean;
}

export class ArenaChoiceParser {
  private current: ChoiceBuffer | undefined;
  private readonly choices = new Map<string, ChoiceBuffer>();
  private pendingChosenId: string | undefined;

  reset() {
    this.current = undefined;
    this.choices.clear();
    this.pendingChosenId = undefined;
  }

  applyLine(line: string): ArenaPowerChoiceEvent[] {
    const events: ArenaPowerChoiceEvent[] = [];
    const header = line.match(/GameState\.DebugPrintEntityChoices\(\).*?id=(\d+).*?Player=([^\s]+).*?ChoiceType=(\w+)/);
    if (header?.[1]) {
      this.flushCurrent(events);
      if (!isArenaDraftChoice(header[2], header[3])) {
        this.current = undefined;
        this.pendingChosenId = undefined;
        return events;
      }
      this.current = {
        id: header[1],
        offered: [],
        chosen: [],
        offeredEmitted: false,
        completedEmitted: false
      };
      this.choices.set(header[1], this.current);
      return events;
    }

    const indexedEntity = line.match(/(?:Entities|m_chosenEntities)\[(\d+)\]=/);
    if (indexedEntity && this.current) {
      const entity = parseEntity(line);
      const card = toChoice(entity);
      if (card) {
        if (line.includes("m_chosenEntities") || this.pendingChosenId === this.current.id) {
          this.current.chosen.push(card);
          if (this.pendingChosenId === this.current.id) {
            this.emitCompleted(this.current, events);
            this.pendingChosenId = undefined;
          }
        } else {
          this.current.offered.push(card);
        }
      }
      return events;
    }

    const showMatch = line.match(/ChoiceCardMgr\.WaitThenShowChoices\(\).*?id=(\d+)/);
    if (showMatch?.[1]) {
      const choice = this.choices.get(showMatch[1]);
      if (choice) {
        this.emitOffered(choice, events);
      }
      return events;
    }

    const sendMatch = line.match(/GameState\.SendChoices\(\).*?id=(\d+)/);
    if (sendMatch?.[1]) {
      const choice = this.choices.get(sendMatch[1]);
      if (choice) {
        this.current = choice;
        this.emitOffered(choice, events);
        this.pendingChosenId = choice.id;
      }
      return events;
    }

    const chosenHeader = line.match(/GameState\.DebugPrintEntitiesChosen\(\).*?id=(\d+)/);
    if (chosenHeader?.[1]) {
      const choice = this.choices.get(chosenHeader[1]);
      if (choice) {
        this.current = choice;
        this.emitOffered(choice, events);
        this.pendingChosenId = choice.id;
      }
      return events;
    }

    if (line.includes("PowerProcessor.PrepareHistoryForCurrentTaskList")) {
      this.flushCurrent(events);
    }

    return events;
  }

  flush(): ArenaPowerChoiceEvent[] {
    const events: ArenaPowerChoiceEvent[] = [];
    this.flushCurrent(events);
    return events;
  }

  private flushCurrent(events: ArenaPowerChoiceEvent[]) {
    if (!this.current) {
      return;
    }

    this.emitOffered(this.current, events);
    this.current = undefined;
    this.pendingChosenId = undefined;
  }

  private emitOffered(choice: ChoiceBuffer, events: ArenaPowerChoiceEvent[]) {
    if (choice.offeredEmitted || choice.offered.length === 0) {
      return;
    }

    choice.offeredEmitted = true;
    events.push({ type: "offered", choiceId: choice.id, offered: [...choice.offered] });
  }

  private emitCompleted(choice: ChoiceBuffer, events: ArenaPowerChoiceEvent[]) {
    if (choice.completedEmitted) {
      return;
    }

    choice.completedEmitted = true;
    events.push({
      type: "completed",
      choiceId: choice.id,
      offered: [...choice.offered],
      chosen: [...choice.chosen]
    });
  }
}

function toChoice(entity: ReturnType<typeof parseEntity>): ArenaCardChoice | undefined {
  if (entity.zone !== "SETASIDE") {
    return undefined;
  }
  const name = entity.name ?? entity.cardId;
  if (!name) {
    return undefined;
  }

  return {
    name,
    count: 1,
    cardId: entity.cardId,
    entityId: entity.id
  };
}

function isArenaDraftChoice(player: string | undefined, choiceType: string | undefined) {
  return /^(local|1)$/i.test(player ?? "") && choiceType?.toUpperCase() === "GENERAL";
}
