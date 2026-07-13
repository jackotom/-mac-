import { describe, expect, it } from "vitest";
import { shouldRecognizeConstructedDeckScreen } from "../src/main/constructedRecognitionPolicy";

describe("constructed recognition policy", () => {
  it("allows a completed Arena session to return to deck selection despite a stale Arena game flag", () => {
    expect(shouldRecognizeConstructedDeckScreen("complete", true)).toBe(true);
  });

  it("does not inspect constructed decks during an active Arena draft", () => {
    expect(shouldRecognizeConstructedDeckScreen("drafting", false)).toBe(false);
  });
});
