import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n"; // must be imported before any component that uses useTranslation

createRoot(document.getElementById("root")!).render(<App />);
