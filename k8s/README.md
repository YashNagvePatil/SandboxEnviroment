# ☸️ Kubernetes (k8s) Infrastructure & Manifests

This directory contains the declarative Kubernetes manifests responsible for deploying, networking, and securing all platform services within the cluster.

---

## 📁 Manifests Reference

| File | Resource Kind | Port Mapping | Description |
| :--- | :--- | :--- | :--- |
| **`ingress.yaml`** | `Ingress` (NGINX) | `80` (HTTP) | Central edge router handling host and path routing with 300s timeout annotations for long-running AI code generation. |
| **`rbac.yaml`** | `ServiceAccount`, `Role`, `RoleBinding` | — | Configures the `resource-manager` identity with RBAC verbs (`get`, `list`, `watch`, `create`, `delete`) on `pods` and `services`. |
| **`ai-deployment.yaml`** | `Deployment` | `3000` | Autonomous AI coding agent (`ai-orchestration`) with 2 replicas, `1Gi` RAM limit, and secret injection from `ai-secret`. |
| **`ai-service.yaml`** | `Service` (`ClusterIP`) | `80 → 3000` | Internal load-balanced service exposing the AI agent to Ingress at `/api/ai`. |
| **`sandbox-deployment.yaml`** | `Deployment` | `3000` | Sandbox API Server (`sandbox:v2`) managing dynamic pod lifecycles. |
| **`sandbox-service.yaml`** | `Service` (`ClusterIP`) | `80 → 3000` | Internal service exposing the Sandbox API to Ingress at `/api/sandbox`. |
| **`router-deployment.yaml`** | `Deployment` | `3000` | Dynamic reverse proxy (`router:v4`) responsible for subdomain routing. |
| **`router-service.yaml`** | `Service` (`ClusterIP`) | `80 → 3000` | Internal service exposing the Router to `*.preview.localhost` and `*.agent.localhost`. |

---

## 🌐 Ingress Routing Topology

```
User Traffic (Port 80)
      │
      ▼
[codespace-ingress] (k8s/ingress.yaml)
      ├── Path: /api/sandbox/*  ──────────► sandbox-service:80 ──► Sandbox Manager Pod (:3000)
      ├── Path: /api/ai/*       ──────────► ai-service:80      ──► AI Orchestration Pod (:3000)
      ├── Host: *.preview.localhost ──────► router-service:80  ──► Router Pod (:3000) ──► sandbox-service-<id>:80 (Vite :5173)
      └── Host: *.agent.localhost   ──────► router-service:80  ──► Router Pod (:3000) ──► sandbox-service-<id>:3000 (Agent :3000)
```

---

## 🔐 RBAC Configuration (`rbac.yaml`)

Dynamic sandboxes require programmatic creation of Kubernetes resources directly from the Node.js application layer. 

- **ServiceAccount:** `resource-manager`
- **Role:** `resource-manager` with permissions over `pods` and `services`
- **RoleBinding:** Binds the `resource-manager` ServiceAccount to the role within the `default` namespace.
- **Consumption:** Assigned to `sandbox-deployment.yaml` via `spec.template.spec.serviceAccountName: resource-manager`.

---

## ⏱️ Ingress Timeout Optimization

AI agents writing multi-file applications with LangChain and Google Gemini can take 60–120 seconds. Standard NGINX Ingress defaults (60s) trigger `504 Gateway Timeout`. The following annotations are configured in `ingress.yaml`:

```yaml
annotations:
  nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
  nginx.ingress.kubernetes.io/proxy-connect-timeout: "60"
```

---

## 🚀 Manual Deployment Order

While **Skaffold** (`skaffold dev`) is the recommended orchestrator, manifests can be applied manually in this specific dependency order:

```bash
# 1. Apply RBAC permissions first
kubectl apply -f k8s/rbac.yaml

# 2. Deploy core services and their respective deployments
kubectl apply -f k8s/sandbox-service.yaml
kubectl apply -f k8s/sandbox-deployment.yaml
kubectl apply -f k8s/router-service.yaml
kubectl apply -f k8s/router-deployment.yaml
kubectl apply -f k8s/ai-service.yaml
kubectl apply -f k8s/ai-deployment.yaml

# 3. Apply Ingress routing rules
kubectl apply -f k8s/ingress.yaml
```
