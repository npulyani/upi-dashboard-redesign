import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

// GitHub Pages SPA routing: restore the original path from the ?p= query param
// that was injected by public/404.html when the user navigated directly to a route.
const redirectPath = new URLSearchParams(window.location.search).get("p");
if (redirectPath) {
  window.history.replaceState(null, "", redirectPath);
}

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
