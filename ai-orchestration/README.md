# 🤖 AI Orchestration Microservice (`ai-orchestration`)

The AI Orchestration service provides an autonomous coding agent capable of interpreting natural language instructions, inspecting sandbox workspace code, and executing file modifications to build complete full-stack React applications on the fly.

---

## 🎯 Architecture Overview

- **ReAct Agent Architecture:** Powered by **LangChain** and **Google Gemini** models via `@langchain/google`.
- **Sandbox Dynamic Tooling:** Tools (`listFiles`, `readFiles`, `updateFiles`) are dynamically bound per request to the internal Kubernetes DNS name of the target sandbox (`http://sandbox-service-<sandboxId>:3000`).
- **Resilient Multi-Model Fallback Chain:** Automatically handles API rate limits, 429 quota exhaustion, and 503 high demand errors by falling back through a tiered sequence of Gemini models:
  ```
  gemini-3.5-flash-lite  ──(on error)──►  gemini-3.6-flash  ──(on error)──►  gemini-3.1-flash-lite
  ```
- **Live HMR Synchronization:** Changes written by the `updateFiles` tool to `/workspace/src/App.jsx` and `/workspace/src/App.css` are instantly detected by the Vite development server on the shared volume, rendering updates in the user's browser without a page refresh.

---

## 📂 File Structure

| File | Purpose |
| :--- | :--- |
| **`server.js`** | Express application entrypoint listening on port `3000`. |
| **`src/app.js`** | Configures health check endpoints (`/api/status/healthz`, `/api/ai/healthz`) and mounts `agentRouter` on `/api/ai`. |
| **`src/routes/agnets.routes.js`** | Express route handler for `POST /api/ai/invoke`. Validates `sandboxId` and `messages`, invokes the agent, and returns the response. |
| **`src/agents/code.agent.js`** | Implements the ReAct LangChain agent loop, system prompt, message normalization, and model fallback chain. |
| **`src/agents/tools.js`** | Factory function `createTools(sandboxId)` returning `listFiles`, `readFiles`, and `updateFiles` LangChain tools targeted at the sandbox's sidecar file agent. |
| **`dockerfile`** | Container specification based on `node:22-alpine`. |
| **`package.json`** | Dependencies: `@langchain/core`, `@langchain/google`, `langchain`, `axios`, `express`, `zod`. |

---

## 🛠️ Dynamic Tools (`src/agents/tools.js`)

When a user calls `POST /api/ai/invoke` with a `sandboxId`, the agent dynamically configures three tools scoped to `http://sandbox-service-${sandboxId}:3000`:

### 1. `listFiles`
- **Description:** Scans the target workspace and returns all existing files (excluding `node_modules` and build directories).
- **Agent Behavior:** Called first to understand the workspace structure before modifying code.

### 2. `readFiles`
- **Description:** Reads source code from specified relative file paths (e.g. `src/App.jsx`, `src/App.css`, `package.json`).
- **Agent Behavior:** Inspects existing components, styles, and installed libraries.

### 3. `updateFiles`
- **Description:** Dispatches a `PATCH` request to update or create files in the workspace.
- **Agent Behavior:** Writes the generated React component code and CSS styles into the workspace, updating the live preview in real time.

---

## 📡 API Reference

### Health Checks
- `GET /api/status/healthz` → `{ "message": "Hello World" }`
- `GET /api/ai/healthz` → `{ "message": "Hello World" }`

### Invoke Agent
- **Endpoint:** `POST /api/ai/invoke`
- **Request Body:**
  ```json
  {
    "sandboxId": "01a1ac0e-7a6a-730a-a02e-8e1665ef6fb8",
    "messages": [
      {
        "role": "user",
        "content": "create a snake game in React with modern CSS styling"
      }
    ]
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "message": "Agent executed successfully",
    "sandboxId": "01a1ac0e-7a6a-730a-a02e-8e1665ef6fb8",
    "previewUrl": "http://01a1ac0e-7a6a-730a-a02e-8e1665ef6fb8.preview.localhost",
    "response": "I have implemented a fully functional Snake game in React with score tracking, responsive grid layout, and keyboard controls..."
  }
  ```

---

## ☸️ Kubernetes Deployment Notes

The AI service runs in Kubernetes as defined by `k8s/ai-deployment.yaml`:
- **Replicas:** 2
- **Memory Allocation:** `requests: 512Mi`, `limits: 1Gi` (Allocated to prevent OOM termination during long LLM compilation steps).
- **Environment:** Retrieves `GEMINI_API_KEY` from the Kubernetes secret `ai-secret`.
- **Probes:** Configured with liveness and readiness probes checking `/api/status/healthz`.

