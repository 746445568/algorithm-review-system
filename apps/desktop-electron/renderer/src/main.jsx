import React from "react";
import { createRoot } from "react-dom/client";
import "./i18n.js";
import { App } from "./App.jsx";
import "./styles.css";
import "./styles/ui-shell.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
