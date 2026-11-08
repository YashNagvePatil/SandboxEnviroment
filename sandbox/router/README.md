# 🔀 Dynamic Reverse Proxy Router (`sandbox/router`)

The Dynamic Router is the platform's central reverse-proxy engine. It dynamically routes incoming HTTP and WebSocket traffic based on request subdomains to the appropriate isolated Kubernetes sandbox services.

---

## 🎯 Core Responsibilities

- **Subdomain-Based Demultiplexing:** Inspects the incoming `Host` header to determine the targeted `sandboxId` and target type (`preview` or `agent`).
- **Dual-Mode Routing:**
  - `http://<sandboxId>.preview.localhost` → Proxies to internal Vite frontend dev server at `http://sandbox-service-<sandboxId>:80` (target port 5173).
  - `http://<sandboxId>.agent.localhost` → Proxies to internal sidecar file manager at `http://sandbox-service-<sandboxId>:3000` (target port 3000).
- **WebSocket & HMR Support:** Enables bidirectional WebSocket streaming (`ws: true`) required by Vite's Hot Module Replacement (HMR).
- **Proxy Memoization & Connection Caching:** Caches `http-proxy-middleware` instances in memory per `sandboxId` to prevent socket recreation overhead across high-frequency asset requests.

---

## 📂 File Structure

| File | Purpose |
| :--- | :--- |
| **`server.js`** | Express application entrypoint listening on port `3000`. |
| **`src/app.js`** | Express application configuring health checks (`/api/status/healthz`, `/api/status/readyz`), proxy caches (`proxies = {}`, `agentProxies = {}`), and host header routing middleware. |
| **`dockerfile`** | Container specification based on `node:22-alpine`. |
| **`package.json`** | Dependencies: `express`, `http-proxy-middleware`, `morgan`. |

---

## 🧠 Memoization & Host Header Routing

```javascript
const proxies = {};
const agentProxies = {};

export function getProxy(sandboxId) {
  const target = `http://sandbox-service-${sandboxId}`;
  if (!proxies[sandboxId]) {
    proxies[sandboxId] = createProxyMiddleware({
      target,
      changeOrigin: false,
      ws: true,
    });
  }
  return proxies[sandboxId];
}

export function getAgentProxy(sandboxId) {
  const target = `http://sandbox-service-${sandboxId}:3000`;
  if (!agentProxies[sandboxId]) {
    agentProxies[sandboxId] = createProxyMiddleware({
      target,
      changeOrigin: false,
      ws: true,
    });
  }
  return agentProxies[sandboxId];
}
```

### Why `changeOrigin: false`?
Vite dev server performs security validations on the HTTP `Host` header. Maintaining the client's original subdomain host (`<sandboxId>.preview.localhost`) ensures compatibility with Vite's `server.allowedHosts: true` policy without incurring 403 Forbidden errors.

---

## 🌐 Network Flow

```
Client Browser (http://<sandboxId>.preview.localhost)
       │
       ▼
NGINX Ingress (*.preview.localhost)
       │
       ▼
router-service:80 ──► router-server container (:3000)
                              │
                    Host Header Parsing
                              │
                              ▼
            Internal K8s DNS: sandbox-service-<sandboxId>:80
                              │
                              ▼
                Vite Dev Server Container (:5173)
```
