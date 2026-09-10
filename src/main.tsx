import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  return <main>
    <p className="eyebrow">Development build</p>
    <h1>A House Divided</h1>
    <p>The native application shell is ready.</p>
    <p className="muted">Singleplayer is under development. Game screens and world simulation are not included in this build.</p>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
