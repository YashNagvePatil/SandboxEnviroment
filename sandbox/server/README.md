# 🖥️ Sandbox API Server (`sandbox/server`)

Yeh service platform ka **Control Plane / Orchestrator** hai. Iska main motive Kubernetes cluster ke saath communicate karke dynamic sandboxes create aur manage karna hai.

---

## 🎯 Main Motive
- **Endpoint 1 (`GET /api/sandbox/health`):** Kubernetes liveness/readiness probe ke liye health check.
- **Endpoint 2 (`POST /api/sandbox/start`):** Jab bhi koi user naya playground shuru kare, yeh endpoint ek unique UUID banata hai aur Kubernetes API ke through ek Pod aur Service live kar deta hai.

---

## 📂 File Structure & Explanations

| File | Purpose |
| :--- | :--- |
| **`server.js`** | App listener jo port `3000` par Express server start karta hai. |
| **`src/app.js`** | Express routes (`/health`, `/start`) aur middleware setup. |
| **`src/kubernetes/config.js`** | `@kubernetes/client-node` ko initialize karta hai (`kc.loadFromDefault()`). Cluster ke andar chalte waqt yeh ServiceAccount ke tokens use karta hai. |
| **`src/kubernetes/pod.js`** | `k8sCoreV1Api.createNamespacedPod()` ko call karta hai. Yeh `template` image se naya container launch karta hai (limits: 500m CPU, 1Gi RAM). |
| **`src/kubernetes/service.js`** | `k8sCoreV1Api.createNamespacedService()` ko call karta hai jo port 80 ko pod ke containerPort 5173 se link karta hai. |
| **`dockerfile`** | `node:22-alpine` base image par build hoti hai (`sandbox:v2`). |

---

## 🔗 Connections
- **Input:** NGINX Ingress (`/api/sandbox/*`) → `sandbox-service:80` → `server.js:3000`.
- **Output:** Kubernetes API Server (RBAC role `resource-manager` use karke naye resources banata hai).
- **Target Image:** Naye banne wale pods ke andar `template` image run karta hai.

