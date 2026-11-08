# 🖥️ Sandbox API Server / Control Plane (`sandbox/server`)

The Sandbox API Server acts as the central control plane for provisioning and managing on-demand Kubernetes sandboxes. It exposes REST endpoints consumed by client applications and coordinates with the Kubernetes Core API.

---

## 🎯 Core Endpoints

### 1. Health Check
- **Route:** `GET /api/sandbox/health`
- **Response:**
  ```json
  { "message": "Sandbox server is running", "status": "ok" }
  ```
- **Role:** Liveness and readiness probe validation within Kubernetes.

### 2. Start Sandbox
- **Route:** `POST /api/sandbox/start`
- **Response:**
  ```json
  {
    "message": "Sandbox started successfully",
    "sandboxId": "01a1ac0e-7a6a-730a-a02e-8e1665ef6fb8",
    "previewUrl": "http://01a1ac0e-7a6a-730a-a02e-8e1665ef6fb8.preview.localhost"
  }
  ```
- **Operations Performed:**
  1. Generates a unique time-sortable UUID v7 (`sandboxId`).
  2. Creates a multi-container Kubernetes Pod (`sandbox-pod-<sandboxId>`).
  3. Creates a companion Kubernetes Service (`sandbox-service-<sandboxId>`).

---

## 📂 File Structure

| File | Purpose |
| :--- | :--- |
| **`server.js`** | Express application entrypoint listening on port `3000`. |
| **`src/app.js`** | Route definitions (`/api/sandbox/health`, `/api/sandbox/start`) and Express middleware. |
| **`src/kubernetes/config.js`** | Initializes `@kubernetes/client-node` using `kc.loadFromDefault()`. When deployed inside a pod, automatically reads the mounted service account credentials. |
| **`src/kubernetes/pod.js`** | Manifest builder that calls `k8sCoreV1Api.createNamespacedPod()`. Defines `initContainers`, volumes, and the two main containers (`sandbox-container` and `agent-container`). |
| **`src/kubernetes/service.js`** | Manifest builder that calls `k8sCoreV1Api.createNamespacedService()`. Exposes port 80 (Vite) and port 3000 (Agent) via a `ClusterIP` service. |
| **`dockerfile`** | Container specification based on `node:22-alpine`. |
| **`package.json`** | Dependencies: `@kubernetes/client-node`, `express`, `uuid`, `morgan`. |

---

## ☸️ Pod & Service Architecture

### Multi-Container Pod Spec (`pod.js`)
- **Shared Volume:** `workspace-volume` (`emptyDir: {}`)
- **`initContainers`:**
  - Name: `init-container`
  - Image: `template`
  - Command: `cp -r /workspace/. /seed/` (populates clean React template into the shared volume)
- **`containers`:**
  1. **`sandbox-container` (`template` image):**
     - Port: `5173` (Vite dev server)
     - Volume Mount: `workspace-volume` at `/workspace`
     - Resource Limits: `500m` CPU, `512Mi` RAM
  2. **`agent-container` (`agent` image):**
     - Port: `3000` (Express file manager)
     - Volume Mount: `workspace-volume` at `/workspace`
     - Resource Limits: `250m` CPU, `256Mi` RAM

### Multi-Port Service Spec (`service.js`)
- **Type:** `ClusterIP`
- **Selector:** `{ app: "sandbox", sandboxId: "<sandboxId>" }`
- **Ports:**
  - `port: 80` → `targetPort: 5173` (named `http-preview`)
  - `port: 3000` → `targetPort: 3000` (named `http-agent`)
