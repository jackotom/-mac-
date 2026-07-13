import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/renderer/App";

describe("opponent overlay QA demo", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders representative opponent data only for the explicit QA route", () => {
    window.history.replaceState({}, "", "/?opponent-overlay=1&qa-opponent-demo=1");

    render(<App />);

    expect(screen.getByRole("button", { name: "查看奥秘 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看奥秘 2" })).toBeInTheDocument();
    expect(screen.getByText("伺机待发")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看奥秘 1" }));
    expect(screen.getByText("法术反制")).toBeInTheDocument();
    expect(screen.getByText("寒冰屏障").closest("li")).toHaveClass("secret-candidate-excluded");
  });

  it("renders both attack icons in the explicit board overlay QA route", () => {
    window.history.replaceState({}, "", "/?board-attack-overlay=1&qa-opponent-demo=1");

    render(<App />);

    expect(screen.getByLabelText("场攻悬浮窗")).toBeInTheDocument();
    expect(screen.getByLabelText("对方场攻 12")).toHaveStyle({ left: "25.5%", top: "22.39%" });
    expect(screen.getByLabelText("我方场攻 7")).toHaveStyle({ left: "25.5%", top: "67.62%" });
  });
});
