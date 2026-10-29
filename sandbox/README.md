# 📦 Sandbox Core Module

Is folder ke andar platform ka poora application layer aur source code hai jo 3 main parts mein divided hai:

---

## 📂 Sub-Folders Overview

```
sandbox/
├── server/     ← 🖥️ API Server (Kubernetes Controller / Orchestrator)
├── router/     ← 🔀 Dynamic Reverse Proxy (Subdomain Routing Engine)
└── template/   ← ⚡ React + Vite Coding Template (Har user ka isolated app)
```

---

## 🔗 Yeh Teeno Folders Aapas Mein Kaise Baat Karte Hain?

1. **User requests a new sandbox:**
   - User `POST /api/sandbox/start` request bhejta hai.
   - Yeh request **`sandbox/server`** ke paas aati hai.

2. **Server creates isolated instance:**
   - **`sandbox/server`** Kubernetes API ko call karke **`sandbox/template`** Docker image ka ek naya Pod (`sandbox-pod-<id>`) aur uske aage ek Service (`sandbox-service-<id>`) launch karta hai.
   - User ko response mein ek unique URL milta hai:  
     `http://<id>.preview.localhost`

3. **User opens preview:**
   - User browser mein `http://<id>.preview.localhost` open karta hai.
   - Request **`sandbox/router`** ke paas jaati hai.
   - Router subdomain se `<id>` nikalta hai aur request ko seedha `sandbox-service-<id>` ke through us specific **`sandbox/template`** container tak proxy kar deta hai!

---

## 🛠️ Docker Images Reference

Har folder ki apni alag Docker image hai:

| Folder | Image Tag | Default Port | Command |
| :--- | :--- | :--- | :--- |
| **`server/`** | `sandbox:v2` | 3000 | `npm start` |
| **`router/`** | `router:v2` | 3000 | `npm start` |
| **`template/`** | `template:latest` | 5173 | `pnpm run dev` |

