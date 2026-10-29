# 🔀 Sandbox Dynamic Router (`sandbox/router`)

Yeh service platform ka **Reverse Proxy Engine** hai. Iska kaam har user ke unique subdomain request ko sahi isolated sandbox container tak pahunchana hai.

---

## 🎯 Main Motive & Real-Life Analogy
- **Real Life Example:** CodeSandbox mein jab aap project kholte hain toh aapko `https://3xk9f-5173.csb.app` jaisa link milta hai. Ek central proxy us subdomain ko padhkar aapke specific container tak connect karti hai.
- **Yahan:** Jab user `http://<sandboxId>.preview.localhost` open karta hai, toh yeh Router request intercept karta hai aur `sandboxId` padhkar request ko `http://sandbox-service-<sandboxId>` par bhej deta hai.

---

## 📂 File Structure & Explanations

| File | Purpose |
| :--- | :--- |
| **`server.js`** | Express application ko port `3000` par start karta hai. |
| **`src/app.js`** | Dynamic proxy middleware (`http-proxy-middleware`), health check endpoints (`/api/status/healthz`, `/api/status/readyz`), aur memoized proxy cache (`proxies = {}`). |
| **`dockerfile`** | `node:20-alpine` base image par build hoti hai (`router:v2`). |
| **`package.json`** | Dependencies: `express`, `http-proxy-middleware`, `morgan`. |

---

## 🧠 Smart Feature: Proxy Caching / Memoization

```javascript
const proxies = {}

function getProxy(sandboxId) {
  const target = `http://sandbox-service-${sandboxId}` 
  if (!proxies[sandboxId]) {
    proxies[sandboxId] = createProxyMiddleware({  
        target,
        changeOrigin: false,
        ws: true,
    });
  }
  return proxies[sandboxId];
}
```

- Har HTTP request (HTML, CSS, JS, Vite HMR WebSocket) par naya proxy middleware create karne ki jagah yeh ek sandbox ke liye sirf 1 baar proxy create karta hai aur memory mein cache kar leta hai.
- **`changeOrigin: false`** isliye rakha gaya hai taaki browser ka original domain (`*.preview.localhost`) Vite server tak pahuche aur Vite security check pass ho sake.

---

## 🔗 Connections
- **Input:** NGINX Ingress (`*.preview.localhost`) → `router-service:80` → `server.js:3000`.
- **Output:** Kubernetes internal DNS ke zariye specific sandbox service (`http://sandbox-service-<sandboxId>`).

