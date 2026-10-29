# ⚡ React + Vite Sandbox Template (`sandbox/template`)

Yeh folder woh **Starter Template** hai jo har user ke isolated sandbox environment ke andar live run hota hai.

---

## 🎯 Main Motive
- Jab bhi koi user naya playground create karta hai, is template ki Docker image (`template:latest`) ka ek container spin up hota hai.
- Yeh container port **5173** par Vite dev server chalata hai jismein React 19 application Hot Module Replacement (HMR) ke saath chalti hai.

---

## 📂 File Structure & Explanations

| File | Purpose |
| :--- | :--- |
| **`index.html`** | HTML entrypoint jismein `<div id="root"></div>` aur `<script type="module" src="/src/main.jsx">` load hota hai. |
| **`vite.config.js`** | Vite dev server configuration (`host: '0.0.0.0'`, `port: 5173`, `allowedHosts: true`). |
| **`package.json`** | React 19, React DOM, Vite 8 aur dev tooling dependencies. |
| **`dockerfile`** | `node:22-alpine` base image par `pnpm install` aur `pnpm run dev` chalata hai. |
| **`src/main.jsx`** | React Root render logic (`ReactDOM.createRoot`). |
| **`src/App.jsx`** | Default React demo component (Counter, logos, styles). |
| **`src/App.css` & `index.css`** | UI styles aur dark mode configurations. |

---

## ⚙️ Vite Configuration Details (`vite.config.js`)

```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',       // Docker container ke bahar traffic accept karne ke liye
    port: 5173,            // Port jo pod aur service targetPort se match karta hai
    allowedHosts: true     // Dynamic subdomain *.preview.localhost ko allow karne ke liye
  }
})
```

---

## 🔗 Connections
- **Connected From:** Kubernetes Pod manifest (`sandbox/server/src/kubernetes/pod.js`) is template ki `template` image ko use karta hai.
- **Port Mapping:** Container port `5173` Kubernetes service (`port 80 -> targetPort 5173`) se judta hai, jo aage Router ke zariye browser tak stream hota hai.
