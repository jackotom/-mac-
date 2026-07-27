import { describe, expect, it } from "vitest";
import { OpponentSecretOverlayVisibility } from "../src/main/opponentSecretOverlayVisibility";

describe("opponent secret overlay visibility", () => {
  it("requests an inactive show when the first secret slot is added", () => {
    const visibility = new OpponentSecretOverlayVisibility();

    expect(visibility.update(0)).toBe(false);
    expect(visibility.update(1)).toBe(true);
  });

  it("requests another inactive show when a second independent slot is added", () => {
    const visibility = new OpponentSecretOverlayVisibility();

    visibility.update(1);

    expect(visibility.update(2)).toBe(true);
  });

  it("does not request a show when candidates change without adding a slot", () => {
    const visibility = new OpponentSecretOverlayVisibility();

    visibility.update(1);

    expect(visibility.update(1)).toBe(false);
  });

  it("does not request a show when slots are removed", () => {
    const visibility = new OpponentSecretOverlayVisibility();

    visibility.update(2);

    expect(visibility.update(1)).toBe(false);
    expect(visibility.update(0)).toBe(false);
  });

  it("requests a show when a new entity replaces an old slot at the same count", () => {
    const visibility = new OpponentSecretOverlayVisibility();

    expect(visibility.update([{ entityId: "secret-1" }])).toBe(true);
    expect(visibility.update([{ entityId: "secret-2" }])).toBe(true);
    expect(visibility.update([{ entityId: "secret-2" }])).toBe(false);
  });
});
