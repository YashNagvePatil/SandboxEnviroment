# 🛠️ Sandbox Sidecar File Manager (`sandbox/agent`)

The Sandbox Agent is an Express-based microservice that runs as a **sidecar container** inside every dynamic sandbox pod. It provides REST APIs for programmatic file system manipulation directly within the shared `/workspace` volume.

---

## 🎯 Role in the Platform

The Sandbox Agent acts as the bridge between external callers (such as the autonomous **AI Orchestration** service) and the live sandbox workspace:

1. **AI File Exploration:** Enables the AI agent to list project files and inspect existing code.
2. **AI Code Generation & Updates:** Accepts code payloads from the AI agent and writes them directly to `/workspace`.
3. **Instant Live Preview:** Because `/workspace` is mounted via a shared `emptyDir` volume to both this agent and the Vite dev server, any file written by this agent triggers an instant Vite Hot Module Replacement (HMR) event on the user's screen.

---

## 📂 REST Endpoints

### 1. List Files
- **Route:** `GET /list-files`
- **Description:** Recursively traverses `/workspace` (excluding `node_modules`, `.git`, `dist`) and returns relative file paths.
- **Response:**
  ```json
  {
    "message": "Files in working directory",
    "files": [
      "package.json",
      "vite.config.js",
      "index.html",
      "src/main.jsx",
      "src/App.jsx",
      "src/App.css",
      "src/index.css"
    ],
    "status": "success"
  }
  ```

### 2. Read Files
- **Route:** `GET /read-files?files=src/App.jsx,src/App.css`
- **Description:** Reads the contents of requested comma-separated relative file paths.
- **Response:**
  ```json
  {
    "message": "File read completed",
    "files": [
      { "src/App.jsx": "import { useState } from 'react'..." },
      { "src/App.css": "#root { max-width: 1280px; }..." }
    ],
    "status": "success"
  }
  ```

### 3. Update Files
- **Route:** `PATCH /update-files`
- **Description:** Updates existing files or creates new files if they do not yet exist. Automatically generates parent directories recursively.
- **Payload Schema:** Supports both `updates` and `files` keys, and both `file` and `path` keys per item:
  ```json
  {
    "updates": [
      {
        "file": "src/App.jsx",
        "content": "import React from 'react'; export default () => <h1>Hello World</h1>;"
      }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "message": "File updates completed",
    "results": [
      { "/workspace/src/App.jsx": "File updated successfully" }
    ],
    "status": "success"
  }
  ```

### 4. Create Files
- **Route:** `POST /create-files`
- **Payload:** `{ "files": [{ "file": "src/components/Header.jsx", "content": "..." }] }`

---

## ☸️ Pod Integration

The agent container is declared in `sandbox/server/src/kubernetes/pod.js`:

```javascript
{
  image: "agent",
  imagePullPolicy: "IfNotPresent",
  name: "agent-container",
  ports: [{ containerPort: 3000, name: "http" }],
  resources: {
    limits: { cpu: "250m", memory: "256Mi" },
    requests: { cpu: "50m", memory: "64Mi" }
  },
  volumeMounts: [
    {
      name: "workspace-volume",
      mountPath: "/workspace"
    }
  ]
}
```
Exposed via the sandbox pod's companion Kubernetes Service on port `3000`.

