import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { attachStyles } from "../shared/shadow-styles";
import createHost, { host_id } from "./create-host";
import App from "../App";

const renderInto = (host: HTMLElement) => {
  // Host-El.shadowRoot
  const shadowRoot = host.attachShadow({ mode: "open" });

  // Every component registered its own stylesheet on import — see shadow-styles.
  attachStyles(shadowRoot);

  // Container
  const container = document.createElement("div");
  container.className = "ai-workspace-root";
  shadowRoot.appendChild(container);

  // Mount the React component into the container
  const root = createRoot(container);
  root.render(createElement(App));
};

export const ensureApp = () => {
  // If the host already exists, we don't need to create it again.
  if (document.getElementById(host_id)) return;

  // Create the host and render the panel into it.
  renderInto(createHost());
};
