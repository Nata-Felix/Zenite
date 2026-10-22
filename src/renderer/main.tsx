import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "@xterm/xterm/css/xterm.css";
import "@fontsource/caveat/400.css";
import "@fontsource/caveat/700.css";
import "./styles.css";
// Aplica o tema antes do primeiro desenho, para não piscar.
import "./theme";
import "./appearance";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
