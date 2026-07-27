import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";

type DiagnosticLevel = "INFO" | "WARN" | "ERROR";
const DEFAULT_MAX_LOG_FILE_BYTES = 2 * 1024 * 1024;

export class DiagnosticLogger {
  readonly filePath: string;
  readonly backupFilePath: string;

  constructor(
    logDirectory: string,
    private readonly maxFileBytes = DEFAULT_MAX_LOG_FILE_BYTES
  ) {
    this.filePath = path.join(logDirectory, "hearthstone-tracker.log");
    this.backupFilePath = `${this.filePath}.1`;
  }

  info(message: string, detail?: unknown) {
    this.write("INFO", message, detail);
  }

  warn(message: string, detail?: unknown) {
    this.write("WARN", message, detail);
  }

  error(message: string, detail?: unknown) {
    this.write("ERROR", message, detail);
  }

  private write(level: DiagnosticLevel, message: string, detail?: unknown) {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const entry = `${JSON.stringify({
        time: new Date().toISOString(),
        level,
        message,
        ...(detail === undefined ? {} : { detail: formatDetail(detail) })
      })}\n`;
      this.rotateIfNeeded(Buffer.byteLength(entry));
      appendFileSync(this.filePath, entry, "utf8");
    } catch {
      // Diagnostic logging must never become a new application failure.
    }
  }

  private rotateIfNeeded(nextEntryBytes: number) {
    if (
      !existsSync(this.filePath) ||
      statSync(this.filePath).size + nextEntryBytes <= Math.max(1, this.maxFileBytes)
    ) {
      return;
    }
    rmSync(this.backupFilePath, { force: true });
    renameSync(this.filePath, this.backupFilePath);
  }
}

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) {
    return detail.stack || detail.message;
  }
  return typeof detail === "string" ? detail : String(detail);
}
