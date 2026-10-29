# ☸️ Kubernetes (k8s) Configurations

Is folder mein Kubernetes ke saare YAML manifest files hain jo poore platform ko deploy, connect, aur manage karte hain.

---

## 📁 Files Overview

| File | Type | Port | Kaam |
| :--- | :--- | :--- | :--- |
| **`ingress.yml`** | Ingress | 80 | External traffic ko path aur subdomain ke hisaab se route karta hai. |
| **`rbac.yml`** | RBAC | - | `resource-manager` ServiceAccount aur permissions deta hai taaki API server dynamic pods bana sake. |
| **`sandbox-deployment.yml`** | Deployment | 3000 | Main API Server (`sandbox:v2`) ka container manage karta hai. |
| **`sandbox.service.yml`** | Service | 80 → 3000 | API Server pods ke aage stable IP provide karta hai (selector: `app: sandbox, tier: api`). |
| **`router-deployment.yml`** | Deployment | 3000 | Router reverse-proxy (`router:v2`) container manage karta hai. |
| **`router-service.yml`** | Service | 80 → 3000 | Router pods ke aage stable IP provide karta hai (selector: `app: router`). |

---

## 🔗 Yeh Folder Dusre Folders Se Kaise Connect Hai?

```
[User Browser]
       │
       ▼
[k8s/ingress.yml] (Port 80)
       ├── /api/sandbox/* ──────► [k8s/sandbox.service.yml] ──► [sandbox/server]
       └── *.preview.localhost ─► [k8s/router-service.yml]  ──► [sandbox/router] ──► [sandbox/template pods]
```

1. **`sandbox/server` se connection:**
   - `sandbox-deployment.yml` `sandbox:v2` Docker image ko chalata hai.
   - `rbac.yml` API server ko permission deta hai taaki woh code se naye pods bana sake.
   - `sandbox.service.yml` Ingress ke requests ko API server tak bhejta hai.

2. **`sandbox/router` se connection:**
   - `router-deployment.yml` `router:v2` Docker image ko chalata hai.
   - `router-service.yml` Ingress se aane wale `*.preview.localhost` traffic ko Router pod tak bhejta hai.

3. **`sandbox/template` se connection:**
   - API server dynamically naye `sandbox-pod-<id>` aur `sandbox-service-<id>` create karta hai jo `template` image use karte hain.

---

## 🚀 Apply Karne Ka Order

```powershell
# Sabse pehle RBAC permissions apply karo
kubectl apply -f k8s/rbac.yml

# Services aur Deployments apply karo
kubectl apply -f k8s/sandbox.service.yml
kubectl apply -f k8s/sandbox-deployment.yml
kubectl apply -f k8s/router-service.yml
kubectl apply -f k8s/router-deployment.yml

# Ingress apply karo (Traffic entrypoint)
kubectl apply -f k8s/ingress.yml
```

