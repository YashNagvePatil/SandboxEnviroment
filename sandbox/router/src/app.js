import express from 'express';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

app.use(morgan('combined'));

app.get('/api/status/healthz', (req, res) => {
  res.status(200).json({ message: 'Sandbox router is running', status: 'ok' });
});

app.get('/api/status/readyz', (req, res) => {
  res.status(200).json({ message: 'Sandbox router is ready', status: 'ok' });
});

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

app.use((req, res, next) => {
  const host = req.headers.host || '';
  const parts = host.split('.');
  const sandboxId = parts[0];
  const type = parts[1]; // 'preview' ya 'agent'

  if (!sandboxId) {
    return res.status(400).send('Invalid Host');
  }

  if (type === 'agent') {
    return getAgentProxy(sandboxId)(req, res, next);
  } else if (type === 'preview') {
    return getProxy(sandboxId)(req, res, next);
  } else {
    // Default fallback
    return getProxy(sandboxId)(req, res, next);
  }
});

export default app;
