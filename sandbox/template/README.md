# ⚡ React 19 + Vite Sandbox Template (`sandbox/template`)

This directory contains the starter React application executed within the primary container of every user's isolated sandbox pod.

---

## 🎯 Purpose & Features

- **Instant Development Playground:** Cloned into every new sandbox instance on creation.
- **Modern Frontend Stack:** Powered by **React 19**, **Vite 8**, and modern CSS styling.
- **Fast Hot Module Replacement (HMR):** Vite watches `/workspace` for real-time code updates and pushes differential asset deltas over WebSockets.
- **Zero-Latency AI Integrations:** When an AI agent or user updates code files in `/workspace`, Vite updates the preview in real-time without a full page reload.

---

## 📂 File Structure

| File | Purpose |
| :--- | :--- |
| **`index.html`** | Single-page application entrypoint containing `<div id="root"></div>` and the module script tag. |
| **`vite.config.js`** | Vite configuration specifying `0.0.0.0` host binding, port `5173`, and allowed dynamic hosts. |
| **`dockerfile`** | Container build specification utilizing `node:22-alpine` and `pnpm`. |
| **`package.json`** | Dependencies: `react@19`, `react-dom@19`, `@vitejs/plugin-react`, `vite@8`. |
| **`src/main.jsx`** | React DOM entrypoint creating the root and rendering `App` inside `React.StrictMode`. |
| **`src/App.jsx`** | Default starter component featuring an interactive counter, logo animations, and documentation links. |
| **`src/App.css` & `index.css`** | Component layout and global theme styles. |

---

## ⚙️ Vite Configuration (`vite.config.js`)

```javascript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',       // Binds to all network interfaces inside the container
    port: 5173,            // Port matched by the Kubernetes service targetPort
    allowedHosts: true     // Permits traffic from *.preview.localhost subdomains
  }
});
```

- **`host: '0.0.0.0'`:** Essential for container networking. Binding only to `localhost` within the container would block external requests forwarded from Kubernetes service proxies.
- **`allowedHosts: true`:** Prevents Vite from rejecting requests whose `Host` header is a dynamic subdomain (such as `01a1ac0e-7a6a-730a-a02e-8e1665ef6fb8.preview.localhost`).

---

## 📦 Container Lifecycle

1. **Docker Build:** Compiled with `pnpm` for fast, reproducible, and space-efficient builds.
2. **Pod Ingestion:**
   - Used as the source image by `init-container` to populate the shared volume (`/seed` → `/workspace`).
   - Run as the `sandbox-container` with command `pnpm run dev` to serve the live preview on port `5173`.
