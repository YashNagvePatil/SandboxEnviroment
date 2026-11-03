import app, { getProxy, getAgentProxy } from "./src/app.js";

const server = app.listen(3000, () => {
  console.log('sandbox router is running on port 3000');
});

server.on('upgrade', (req, socket, head) => {
  const host = req.headers.host || '';
  const parts = host.split('.');
  const sandboxId = parts[0];
  const type = parts[1];

  if (sandboxId) {
    const proxy = (type === 'agent') ? getAgentProxy(sandboxId) : getProxy(sandboxId);
    if (proxy && typeof proxy.upgrade === 'function') {
      proxy.upgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  } else {
    socket.destroy();
  }
});
