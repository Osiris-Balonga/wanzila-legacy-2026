import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { App } from "./App";
import "@fontsource-variable/inter/wght.css";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root was not found");
}

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
