import React from "react";
import { createRoot } from "react-dom/client";
import ReaderApp from "../src/reader/ReaderApp";
import "../app/globals.css";
import "./mobile.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReaderApp />
  </React.StrictMode>,
);
