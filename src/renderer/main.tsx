import React from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import App from "./App";
import { markRendererReady } from "./rendererReady";
import "./styles.css";
import "./overlayStyles.css";
import "./arenaChoiceOverlayStyles.css";
import "./cardHoverStyles.css";
import "./opponentOverlayStyles.css";
import "./boardAttackOverlayStyles.css";
import "./ladderDeckRecommendationStyles.css";
import "./matchHistoryStyles.css";
import "./desktopReplicaStyles.css";
import "./homeNewsStyles.css";
import "./arenaHeroRankingStyles.css";

const rootElement = document.getElementById("root");
const isBoardAttackOverlay = new URLSearchParams(window.location.search).get("board-attack-overlay") === "1";

if (isBoardAttackOverlay) {
  document.documentElement.classList.add("board-attack-overlay-document");
}

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  flushSync(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
  markRendererReady(document);
}
