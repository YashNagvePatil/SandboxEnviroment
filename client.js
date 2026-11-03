import "/node_modules/.pnpm/vite@8.3.5/node_modules/vite/dist/client/env.mjs";
//#region ../../node_modules/.pnpm/nanoid@5.1.16/node_modules/nanoid/non-secure/index.js
let urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
let nanoid = (size = 21) => {
	let id = "";
	let i = size | 0;
	while (i-- > 0) id += urlAlphabet[Math.random() * 64 | 0];
	return id;
};
//#endregion
//#region src/shared/constants.ts
/**
* Prefix for resolved Ids that are not valid browser import specifiers
*/
const VALID_ID_PREFIX = `/@id/`;
/**
* Plugins that use 'virtual modules' (e.g. for helper functions), prefix the
* module ID with `\0`, a convention from the rollup ecosystem.
* This prevents other plugins from trying to process the id (like node resolution),
* and core features like sourcemaps can use this info to differentiate between
* virtual modules and regular files.
* `\0` is not a permitted char in import URLs so we have to replace them during
* import analysis. The id will be decoded back before entering the plugins pipeline.
* These encoded virtual ids are also prefixed by the VALID_ID_PREFIX, so virtual
* modules in the browser end up encoded as `/@id/__x00__{id}`
*/
const NULL_BYTE_PLACEHOLDER = `__x00__`;
let SOURCEMAPPING_URL = "sourceMa";
SOURCEMAPPING_URL += "ppingURL";
typeof process !== "undefined" && process.platform;
/**
* Prepend `/@id/` and replace null byte so the id is URL-safe.
* BrowserURL rendering wraps ModuleURLs that are not valid browser import
* specifiers before adding base.
*/
function wrapId(id) {
	return id.startsWith("/@id/") ? id : VALID_ID_PREFIX + id.replace("\0", NULL_BYTE_PLACEHOLDER);
}
/** Render a decoded ModuleURL as a BrowserURL, wrapping virtual IDs and adding base. */
function moduleUrlToBrowserUrl(moduleUrl, base) {
	const browserUrl = moduleUrl[0] !== "." && moduleUrl[0] !== "/" ? wrapId(moduleUrl) : moduleUrl;
	return base ? joinUrlSegments(base, browserUrl) : browserUrl;
}
function joinUrlSegments(a, b) {
	if (!a || !b) return a || b || "";
	if (a.endsWith("/")) a = a.substring(0, a.length - 1);
	if (b[0] !== "/") b = "/" + b;
	return a + b;
}
(async function() {}).constructor;
function promiseWithResolvers() {
	let resolve;
	let reject;
	return {
		promise: new Promise((_resolve, _reject) => {
			resolve = _resolve;
			reject = _reject;
		}),
		resolve,
		reject
	};
}
//#endregion
//#region src/shared/moduleRunnerTransport.ts
function reviveInvokeError(e) {
	const error = new Error(e.message || "Unknown invoke error");
	Object.assign(error, e, { runnerError: /* @__PURE__ */ new Error("RunnerError") });
	return error;
}
const createInvokeableTransport = (transport) => {
	if (transport.invoke) return {
		...transport,
		async invoke(name, data) {
			const result = await transport.invoke({
				type: "custom",
				event: "vite:invoke",
				data: {
					id: "send",
					name,
					data
				}
			});
			if ("error" in result) throw reviveInvokeError(result.error);
			return result.result;
		}
	};
	if (!transport.send || !transport.connect) throw new Error("transport must implement send and connect when invoke is not implemented");
	const rpcPromises = /* @__PURE__ */ new Map();
	return {
		...transport,
		connect({ onMessage, onDisconnection }) {
			return transport.connect({
				onMessage(payload) {
					if (payload.type === "custom" && payload.event === "vite:invoke") {
						const data = payload.data;
						if (data.id.startsWith("response:")) {
							const invokeId = data.id.slice(9);
							const promise = rpcPromises.get(invokeId);
							if (!promise) return;
							if (promise.timeoutId) clearTimeout(promise.timeoutId);
							rpcPromises.delete(invokeId);
							const { error, result } = data.data;
							if (error) promise.reject(error);
							else promise.resolve(result);
							return;
						}
					}
					onMessage(payload);
				},
				onDisconnection
			});
		},
		disconnect() {
			rpcPromises.forEach((promise) => {
				promise.reject(/* @__PURE__ */ new Error(`transport was disconnected, cannot call ${JSON.stringify(promise.name)}`));
			});
			rpcPromises.clear();
			return transport.disconnect?.();
		},
		send(data) {
			return transport.send(data);
		},
		async invoke(name, data) {
			const promiseId = nanoid();
			const wrappedData = {
				type: "custom",
				event: "vite:invoke",
				data: {
					name,
					id: `send:${promiseId}`,
					data
				}
			};
			const sendPromise = transport.send(wrappedData);
			const { promise, resolve, reject } = promiseWithResolvers();
			const timeout = transport.timeout ?? 6e4;
			let timeoutId;
			if (timeout > 0) {
				timeoutId = setTimeout(() => {
					rpcPromises.delete(promiseId);
					reject(/* @__PURE__ */ new Error(`transport invoke timed out after ${timeout}ms (data: ${JSON.stringify(wrappedData)})`));
				}, timeout);
				timeoutId?.unref?.();
			}
			rpcPromises.set(promiseId, {
				resolve,
				reject,
				name,
				timeoutId
			});
			if (sendPromise) sendPromise.catch((err) => {
				clearTimeout(timeoutId);
				rpcPromises.delete(promiseId);
				reject(err);
			});
			try {
				return await promise;
			} catch (err) {
				throw reviveInvokeError(err);
			}
		}
	};
};
const normalizeModuleRunnerTransport = (transport) => {
	const invokeableTransport = createInvokeableTransport(transport);
	let isConnected = !invokeableTransport.connect;
	let connectingPromise;
	return {
		...transport,
		...invokeableTransport.connect ? { async connect(onMessage) {
			if (isConnected) return;
			if (connectingPromise) {
				await connectingPromise;
				return;
			}
			const maybePromise = invokeableTransport.connect({
				onMessage: onMessage ?? (() => {}),
				onDisconnection() {
					isConnected = false;
				}
			});
			if (maybePromise) {
				connectingPromise = maybePromise;
				await connectingPromise;
				connectingPromise = void 0;
			}
			isConnected = true;
		} } : {},
		...invokeableTransport.disconnect ? { async disconnect() {
			if (!isConnected) return;
			if (connectingPromise) await connectingPromise;
			isConnected = false;
			await invokeableTransport.disconnect();
		} } : {},
		async send(data) {
			if (!invokeableTransport.send) return;
			if (!isConnected) {
				if (connectingPromise) await connectingPromise;
				else throw new SendBeforeConnectError("send was called before connect");
			}
			await invokeableTransport.send(data);
		},
		async invoke(name, data) {
			if (!isConnected) {
				if (connectingPromise) await connectingPromise;
				else throw new SendBeforeConnectError("invoke was called before connect");
			}
			return invokeableTransport.invoke(name, data);
		}
	};
};
var SendBeforeConnectError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "SendBeforeConnectError";
	}
};
const createWebSocketModuleRunnerTransport = (options) => {
	const pingInterval = options.pingInterval ?? 3e4;
	let ws;
	let pingIntervalId;
	return {
		async connect({ onMessage, onDisconnection }) {
			const socket = options.createConnection();
			socket.addEventListener("message", ({ data }) => {
				onMessage(JSON.parse(data));
			});
			let isOpened = socket.readyState === socket.OPEN;
			if (!isOpened) await new Promise((resolve, reject) => {
				socket.addEventListener("open", () => {
					isOpened = true;
					resolve();
				}, { once: true });
				socket.addEventListener("close", () => {
					if (!isOpened) {
						reject(/* @__PURE__ */ new Error("WebSocket closed without opened."));
						return;
					}
					onMessage({
						type: "custom",
						event: "vite:ws:disconnect",
						data: { webSocket: socket }
					});
					onDisconnection();
				});
			});
			onMessage({
				type: "custom",
				event: "vite:ws:connect",
				data: { webSocket: socket }
			});
			ws = socket;
			pingIntervalId = setInterval(() => {
				if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
			}, pingInterval);
		},
		disconnect() {
			clearInterval(pingIntervalId);
			ws?.close();
		},
		send(data) {
			ws.send(JSON.stringify(data));
		}
	};
};
//#endregion
//#region src/shared/pretty-format.ts
const DEFAULT_OPTIONS = {
	maxDepth: 3,
	maxWidth: 100
};
const objectToString = Object.prototype.toString;
const errorToString = Error.prototype.toString;
const identifierRE = /^[a-z_$][\w$]*$/i;
function prettyFormat(value, options = {}) {
	return printer(value, {
		...DEFAULT_OPTIONS,
		...options
	}, 0, []);
}
function printer(value, config, depth, refs) {
	return printBasicValue(value) ?? printComplexValue(value, config, depth, refs);
}
function printBasicValue(value) {
	if (value == null) return String(value);
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
	if (typeof value === "bigint") return `${value}n`;
	if (typeof value === "boolean" || typeof value === "symbol") return String(value);
	if (typeof value === "function") return value.name ? `[Function: ${value.name}]` : "[Function]";
	const type = objectToString.call(value);
	if (type === "[object Date]") return Number.isNaN(+value) ? "Date { NaN }" : value.toISOString();
	if (type === "[object Error]" || value instanceof Error) return `[${errorToString.call(value)}]`;
}
function printComplexValue(value, config, depth, refs) {
	if (refs.includes(value)) return "[Circular]";
	refs = [...refs, value];
	const hitMaxDepth = ++depth > config.maxDepth;
	if (Array.isArray(value)) return hitMaxDepth ? "[Array]" : `[${printListItems(value, config, depth, refs)}]`;
	return hitMaxDepth ? "[Object]" : `{${printObjectProperties(value, config, depth, refs)}}`;
}
function printListItems(value, config, depth, refs) {
	const width = Math.min(value.length, config.maxWidth);
	const result = [];
	for (let i = 0; i < width; i++) result.push(i in value ? printer(value[i], config, depth, refs) : "");
	if (width < value.length) result.push(`…(${value.length - width})`);
	return withSpacing(result);
}
function printObjectProperties(value, config, depth, refs) {
	const keys = Object.keys(value);
	const width = Math.min(keys.length, config.maxWidth);
	const result = [];
	for (let i = 0; i < width; i++) {
		const key = keys[i];
		const name = key !== "__proto__" && identifierRE.test(key) ? key : JSON.stringify(key);
		result.push(`${name}: ${printer(value[key], config, depth, refs)}`);
	}
	if (width < keys.length) result.push(`…(${keys.length - width})`);
	return withSpacing(result);
}
function withSpacing(values) {
	return values.length === 0 ? "" : ` ${values.join(", ")} `;
}
//#endregion
//#region src/shared/forwardConsole.ts
function setupForwardConsoleHandler(transport, options, console = globalThis.console) {
	if (!options.enabled) return;
	async function sendError(type, error) {
		await transport.send({
			type: "custom",
			event: "vite:forward-console",
			data: {
				type,
				data: {
					name: error?.name || "Unknown Error",
					message: error?.message || String(error),
					stack: error?.stack
				}
			}
		});
	}
	async function sendLog(level, args) {
		try {
			await transport.send({
				type: "custom",
				event: "vite:forward-console",
				data: {
					type: "log",
					data: {
						level,
						message: truncateConsoleMessage(formatConsoleArgs(args))
					}
				}
			});
		} catch (err) {
			try {
				await sendError("unhandled-rejection", err);
			} catch (err) {
				if (!(err instanceof SendBeforeConnectError)) originalConsoleError("Failed to send error to Vite server:", err);
			}
		}
	}
	const originalConsoleError = console.error;
	for (const level of options.logLevels) {
		const original = console[level];
		if (typeof original !== "function") continue;
		console[level] = (...args) => {
			original(...args);
			sendLog(level, args);
		};
	}
	if (options.unhandledErrors && typeof window !== "undefined") {
		window.addEventListener("error", async (event) => {
			const error = event.error ?? (event.message ? new Error(event.message) : event);
			try {
				await sendError("error", error);
			} catch (err) {
				if (!(err instanceof SendBeforeConnectError)) originalConsoleError("Failed to send error to Vite server:", err);
			}
		});
		window.addEventListener("unhandledrejection", async (event) => {
			try {
				await sendError("unhandled-rejection", event.reason);
			} catch (err) {
				if (!(err instanceof SendBeforeConnectError)) originalConsoleError("Failed to send error to Vite server:", err);
			}
		});
	}
}
function formatConsoleArgs(args) {
	if (args.length === 0) return "";
	if (typeof args[0] !== "string") return args.map((arg) => stringifyConsoleArg(arg)).join(" ");
	const len = args.length;
	let i = 1;
	let message = args[0].replace(/%[sdjifoOc%]/g, (specifier) => {
		if (specifier === "%%") return "%";
		if (i >= len) return specifier;
		const arg = args[i++];
		switch (specifier) {
			case "%s":
				if (typeof arg === "bigint") return `${arg.toString()}n`;
				return typeof arg === "object" && arg != null ? stringifyConsoleArg(arg) : String(arg);
			case "%d":
				if (typeof arg === "bigint") return `${arg.toString()}n`;
				if (typeof arg === "symbol") return "NaN";
				return Number(arg).toString();
			case "%i":
				if (typeof arg === "bigint") return `${arg.toString()}n`;
				return Number.parseInt(String(arg), 10).toString();
			case "%f": return Number.parseFloat(String(arg)).toString();
			case "%o":
			case "%O": return stringifyConsoleArg(arg);
			case "%j": try {
				return JSON.stringify(arg) ?? "undefined";
			} catch {
				return "[Circular]";
			}
			case "%c": return "";
			default: return specifier;
		}
	});
	for (let arg = args[i]; i < len; arg = args[++i]) if (arg == null || typeof arg !== "object") message += ` ${typeof arg === "symbol" ? arg.toString() : String(arg)}`;
	else message += ` ${stringifyConsoleArg(arg)}`;
	return message;
}
function stringifyConsoleArg(value) {
	if (typeof value === "string") return value;
	if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
	try {
		return prettyFormat(value);
	} catch {
		return String(value);
	}
}
const MAX_CONSOLE_MESSAGE_LENGTH = 1e4;
function truncateConsoleMessage(message) {
	if (message.length <= MAX_CONSOLE_MESSAGE_LENGTH) return message;
	let end = 9999;
	if (isHighSurrogate(message[end - 1])) end--;
	return `${message.slice(0, end)}…`;
}
function isHighSurrogate(value) {
	return value >= "\ud800" && value <= "\udbff";
}
//#endregion
//#region \0@oxc-project+runtime@0.154.0/helpers/esm/typeof.js
function _typeof(o) {
	"@babel/helpers - typeof";
	return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
		return typeof o;
	} : function(o) {
		return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
	}, _typeof(o);
}
//#endregion
//#region \0@oxc-project+runtime@0.154.0/helpers/esm/toPrimitive.js
function toPrimitive(t, r) {
	if ("object" != _typeof(t) || !t) return t;
	var e = t[Symbol.toPrimitive];
	if (void 0 !== e) {
		var i = e.call(t, r || "default");
		if ("object" != _typeof(i)) return i;
		throw new TypeError("@@toPrimitive must return a primitive value.");
	}
	return ("string" === r ? String : Number)(t);
}
//#endregion
//#region \0@oxc-project+runtime@0.154.0/helpers/esm/toPropertyKey.js
function toPropertyKey(t) {
	var i = toPrimitive(t, "string");
	return "symbol" == _typeof(i) ? i : i + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.154.0/helpers/esm/defineProperty.js
function _defineProperty(e, r, t) {
	return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
		value: t,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[r] = t, e;
}
//#endregion
//#region src/shared/hmr.ts
var HMRContext = class {
	constructor(hmrClient, ownerPath) {
		this.hmrClient = hmrClient;
		this.ownerPath = ownerPath;
		_defineProperty(this, "newListeners", void 0);
		if (!hmrClient.dataMap.has(ownerPath)) hmrClient.dataMap.set(ownerPath, {});
		const mod = hmrClient.hotModulesMap.get(ownerPath);
		if (mod) mod.callbacks = [];
		const staleListeners = hmrClient.ctxToListenersMap.get(ownerPath);
		if (staleListeners) for (const [event, staleFns] of staleListeners) {
			const listeners = hmrClient.customListenersMap.get(event);
			if (listeners) hmrClient.customListenersMap.set(event, listeners.filter((l) => !staleFns.includes(l)));
		}
		this.newListeners = /* @__PURE__ */ new Map();
		hmrClient.ctxToListenersMap.set(ownerPath, this.newListeners);
	}
	get data() {
		return this.hmrClient.dataMap.get(this.ownerPath);
	}
	accept(deps, callback) {
		if (typeof deps === "function" || !deps) this.acceptDeps([this.ownerPath], ([mod]) => deps?.(mod));
		else if (typeof deps === "string") this.acceptDeps([deps], ([mod]) => callback?.(mod));
		else if (Array.isArray(deps)) this.acceptDeps(deps, callback);
		else throw new Error(`invalid hot.accept() usage.`);
	}
	acceptExports(exportNames, callback) {
		this.acceptDeps([this.ownerPath], ([mod]) => callback?.(mod), typeof exportNames === "string" ? [exportNames] : exportNames);
	}
	dispose(cb) {
		this.hmrClient.disposeMap.set(this.ownerPath, cb);
	}
	prune(cb) {
		this.hmrClient.pruneMap.set(this.ownerPath, cb);
	}
	decline() {}
	invalidate(message) {
		const firstInvalidatedBy = this.hmrClient.currentFirstInvalidatedBy ?? this.ownerPath;
		this.hmrClient.notifyListeners("vite:invalidate", {
			path: this.ownerPath,
			message,
			firstInvalidatedBy
		});
		this.send("vite:invalidate", {
			path: this.ownerPath,
			message,
			firstInvalidatedBy
		});
		this.hmrClient.logger.debug(`invalidate ${this.ownerPath}${message ? `: ${message}` : ""}`);
	}
	on(event, cb) {
		const addToMap = (map) => {
			const existing = map.get(event) || [];
			existing.push(cb);
			map.set(event, existing);
		};
		addToMap(this.hmrClient.customListenersMap);
		addToMap(this.newListeners);
	}
	off(event, cb) {
		const removeFromMap = (map) => {
			const existing = map.get(event);
			if (existing === void 0) return;
			const pruned = existing.filter((l) => l !== cb);
			if (pruned.length === 0) {
				map.delete(event);
				return;
			}
			map.set(event, pruned);
		};
		removeFromMap(this.hmrClient.customListenersMap);
		removeFromMap(this.newListeners);
	}
	send(event, data) {
		this.hmrClient.send({
			type: "custom",
			event,
			data
		});
	}
	acceptDeps(deps, callback = () => {}, exports) {
		const mod = this.hmrClient.hotModulesMap.get(this.ownerPath) || {
			id: this.ownerPath,
			callbacks: []
		};
		mod.callbacks.push({
			deps,
			fn: callback,
			exports
		});
		this.hmrClient.hotModulesMap.set(this.ownerPath, mod);
	}
};
var HMRClient = class {
	constructor(logger, transport, importUpdatedModule) {
		this.logger = logger;
		this.transport = transport;
		this.importUpdatedModule = importUpdatedModule;
		_defineProperty(this, "hotModulesMap", /* @__PURE__ */ new Map());
		_defineProperty(this, "disposeMap", /* @__PURE__ */ new Map());
		_defineProperty(this, "pruneMap", /* @__PURE__ */ new Map());
		_defineProperty(this, "dataMap", /* @__PURE__ */ new Map());
		_defineProperty(this, "customListenersMap", /* @__PURE__ */ new Map());
		_defineProperty(this, "ctxToListenersMap", /* @__PURE__ */ new Map());
		_defineProperty(this, "currentFirstInvalidatedBy", void 0);
		_defineProperty(this, "updateQueue", []);
		_defineProperty(this, "pendingUpdateQueue", false);
	}
	async notifyListeners(event, data) {
		const cbs = this.customListenersMap.get(event);
		if (cbs) await Promise.allSettled(cbs.map((cb) => cb(data)));
	}
	send(payload) {
		this.transport.send(payload).catch((err) => {
			this.logger.error(err);
		});
	}
	clear() {
		this.hotModulesMap.clear();
		this.disposeMap.clear();
		this.pruneMap.clear();
		this.dataMap.clear();
		this.customListenersMap.clear();
		this.ctxToListenersMap.clear();
	}
	async prunePaths(paths) {
		try {
			await Promise.all(paths.map((path) => {
				const disposer = this.disposeMap.get(path);
				if (disposer) return disposer(this.dataMap.get(path));
			}));
			await Promise.all(paths.map((path) => {
				const fn = this.pruneMap.get(path);
				if (fn) return fn(this.dataMap.get(path));
			}));
		} finally {
			paths.forEach((path) => this.dataMap.delete(path));
		}
	}
	warnFailedUpdate(err, path) {
		if (!(err instanceof Error) || !err.message.includes("fetch")) this.logger.error(err);
		this.logger.error(`Failed to reload ${path}. This could be due to syntax errors or importing non-existent modules. (see errors above)`);
	}
	/**
	* buffer multiple hot updates triggered by the same src change
	* so that they are invoked in the same order they were sent.
	* (otherwise the order may be inconsistent because of the http request round trip)
	*/
	async queueUpdate(payload) {
		this.updateQueue.push(this.fetchUpdate(payload));
		if (!this.pendingUpdateQueue) {
			this.pendingUpdateQueue = true;
			await Promise.resolve();
			this.pendingUpdateQueue = false;
			const loading = [...this.updateQueue];
			this.updateQueue = [];
			(await Promise.all(loading)).forEach((fn) => fn && fn());
		}
	}
	async fetchUpdate(update) {
		const { path, acceptedPath, firstInvalidatedBy } = update;
		const mod = this.hotModulesMap.get(path);
		if (!mod) return;
		let fetchedModule;
		const isSelfUpdate = path === acceptedPath;
		const qualifiedCallbacks = mod.callbacks.filter(({ deps }) => deps.includes(acceptedPath));
		if (isSelfUpdate || qualifiedCallbacks.length > 0) {
			const disposer = this.disposeMap.get(acceptedPath);
			if (disposer) await disposer(this.dataMap.get(acceptedPath));
			try {
				fetchedModule = await this.importUpdatedModule(update);
			} catch (e) {
				this.warnFailedUpdate(e, acceptedPath);
			}
		}
		return () => {
			try {
				this.currentFirstInvalidatedBy = firstInvalidatedBy;
				for (const { deps, fn } of qualifiedCallbacks) fn(deps.map((dep) => dep === acceptedPath ? fetchedModule : void 0));
				const loggedPath = isSelfUpdate ? path : `${acceptedPath} via ${path}`;
				this.logger.debug(`hot updated: ${loggedPath}`);
			} finally {
				this.currentFirstInvalidatedBy = void 0;
			}
		};
	}
};
//#endregion
//#region src/shared/hmrHandler.ts
function createHMRHandler(handler) {
	const queue = new Queue();
	return (payload) => queue.enqueue(() => handler(payload));
}
var Queue = class {
	constructor() {
		_defineProperty(this, "queue", []);
		_defineProperty(this, "pending", false);
	}
	enqueue(promise) {
		return new Promise((resolve, reject) => {
			this.queue.push({
				promise,
				resolve,
				reject
			});
			this.dequeue();
		});
	}
	dequeue() {
		if (this.pending) return false;
		const item = this.queue.shift();
		if (!item) return false;
		this.pending = true;
		item.promise().then(item.resolve).catch(item.reject).finally(() => {
			this.pending = false;
			this.dequeue();
		});
		return true;
	}
};
//#endregion
//#region src/client/overlay.ts
const hmrConfigName = "vite.config.js";
const base$1 = "/" || "/";
const cspNonce = "document" in globalThis ? document.querySelector("meta[property=csp-nonce]")?.nonce : void 0;
function h(e, attrs = {}, ...children) {
	const elem = document.createElement(e);
	for (const [k, v] of Object.entries(attrs)) if (v !== void 0) elem.setAttribute(k, v);
	elem.append(...children);
	return elem;
}
const templateStyle = `
:host {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 99999;
  --monospace: 'SFMono-Regular', Consolas,
  'Liberation Mono', Menlo, Courier, monospace;
  --red: #ff5555;
  --yellow: #e2aa53;
  --purple: #cfa4ff;
  --cyan: #2dd9da;
  --dim: #c9c9c9;

  --window-background: #181818;
  --window-color: #d8d8d8;
}

.backdrop {
  position: fixed;
  z-index: 99999;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll;
  margin: 0;
  background: rgba(0, 0, 0, 0.66);
}

.window {
  font-family: var(--monospace);
  line-height: 1.5;
  max-width: 80vw;
  color: var(--window-color);
  box-sizing: border-box;
  margin: 30px auto;
  padding: 2.5vh 4vw;
  position: relative;
  background: var(--window-background);
  border-radius: 6px 6px 8px 8px;
  box-shadow: 0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22);
  overflow: hidden;
  border-top: 8px solid var(--red);
  direction: ltr;
  text-align: left;
}

pre {
  font-family: var(--monospace);
  font-size: 16px;
  margin-top: 0;
  margin-bottom: 1em;
  overflow-x: scroll;
  scrollbar-width: none;
}

pre::-webkit-scrollbar {
  display: none;
}

pre.frame::-webkit-scrollbar {
  display: block;
  height: 5px;
}

pre.frame::-webkit-scrollbar-thumb {
  background: #999;
  border-radius: 5px;
}

pre.frame {
  scrollbar-width: thin;
}

.message {
  line-height: 1.3;
  font-weight: 400;
  white-space: pre-wrap;
}

.message-body {
  color: var(--red);
}

.plugin {
  color: var(--purple);
}

.file {
  color: var(--cyan);
  margin-bottom: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.frame {
  color: var(--yellow);
}

.stack {
  font-size: 13px;
  color: var(--dim);
}

.tip {
  font-size: 13px;
  color: #999;
  border-top: 1px dotted #999;
  padding-top: 13px;
  line-height: 1.8;
}

code {
  font-size: 13px;
  font-family: var(--monospace);
  color: var(--yellow);
}

.file-link {
  text-decoration: underline;
  cursor: pointer;
}

kbd {
  line-height: 1.5;
  font-family: ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.75rem;
  font-weight: 700;
  background-color: rgb(38, 40, 44);
  color: rgb(166, 167, 171);
  padding: 0.15rem 0.3rem;
  border-radius: 0.25rem;
  border-width: 0.0625rem 0.0625rem 0.1875rem;
  border-style: solid;
  border-color: rgb(54, 57, 64);
  border-image: initial;
}
`;
const createTemplate = () => h("div", {
	class: "backdrop",
	part: "backdrop"
}, h("div", {
	class: "window",
	part: "window"
}, h("pre", {
	class: "message",
	part: "message"
}, h("span", {
	class: "plugin",
	part: "plugin"
}), h("span", {
	class: "message-body",
	part: "message-body"
})), h("pre", {
	class: "file",
	part: "file"
}), h("pre", {
	class: "frame",
	part: "frame"
}), h("pre", {
	class: "stack",
	part: "stack"
}), h("div", {
	class: "tip",
	part: "tip"
}, "Click outside, press ", h("kbd", {}, "Esc"), " key, or fix the code to dismiss.", h("br"), "You can also disable this overlay by setting ", h("code", { part: "config-option-name" }, "server.hmr.overlay"), " to ", h("code", { part: "config-option-value" }, "false"), " in ", h("code", { part: "config-file-name" }, hmrConfigName), ".")), h("style", { nonce: cspNonce }, templateStyle));
const fileRE = /(?:file:\/\/)?(?:[a-zA-Z]:\\|\/).*?:\d+:\d+/g;
const codeframeRE = /^(?:>?\s*\d+\s+\|.*|\s+\|\s*\^.*)\r?\n/gm;
const { HTMLElement = class {} } = globalThis;
var ErrorOverlay = class extends HTMLElement {
	constructor(err, links = true) {
		super();
		this.root = this.attachShadow({ mode: "open" });
		this.root.appendChild(createTemplate());
		codeframeRE.lastIndex = 0;
		const hasFrame = err.frame && codeframeRE.test(err.frame);
		const message = hasFrame ? err.message.replace(codeframeRE, "") : err.message;
		if (err.plugin) this.text(".plugin", `[plugin:${err.plugin}] `);
		this.text(".message-body", message.trim());
		const [file] = (err.loc?.file || err.id || "unknown file").split(`?`);
		if (err.loc) this.text(".file", `${file}:${err.loc.line}:${err.loc.column}`, links);
		else if (err.id) this.text(".file", file);
		if (hasFrame) this.text(".frame", err.frame.trim());
		this.text(".stack", err.stack, links);
		this.root.querySelector(".window").addEventListener("click", (e) => {
			e.stopPropagation();
		});
		this.addEventListener("click", () => {
			this.close();
		});
		this.closeOnEsc = (e) => {
			if (e.key === "Escape" || e.code === "Escape") this.close();
		};
		document.addEventListener("keydown", this.closeOnEsc);
	}
	text(selector, text, linkFiles = false) {
		const el = this.root.querySelector(selector);
		if (!linkFiles) el.textContent = text;
		else {
			let curIndex = 0;
			let match;
			fileRE.lastIndex = 0;
			while (match = fileRE.exec(text)) {
				const { 0: file, index } = match;
				const frag = text.slice(curIndex, index);
				el.appendChild(document.createTextNode(frag));
				const link = document.createElement("a");
				link.textContent = file;
				link.className = "file-link";
				link.onclick = () => {
					fetch(new URL(`${base$1}__open-in-editor?file=${encodeURIComponent(file)}`, import.meta.url));
				};
				el.appendChild(link);
				curIndex += frag.length + file.length;
			}
			if (curIndex < text.length) el.appendChild(document.createTextNode(text.slice(curIndex)));
		}
	}
	close() {
		this.parentNode?.removeChild(this);
		document.removeEventListener("keydown", this.closeOnEsc);
	}
};
const overlayId = "vite-error-overlay";
const { customElements } = globalThis;
if (customElements && !customElements.get("vite-error-overlay")) customElements.define(overlayId, ErrorOverlay);
//#endregion
//#region src/client/client.ts
console.debug("[vite] connecting...");
const importMetaUrl = new URL(import.meta.url);
const serverHost = "localhost:5173/";
const socketProtocol = null || (importMetaUrl.protocol === "https:" ? "wss" : "ws");
const hmrPort = null;
const socketHost = `${null || importMetaUrl.hostname}:${hmrPort || importMetaUrl.port}${"/"}`;
const directSocketHost = "localhost:5173/";
const base = "/" || "/";
const hmrTimeout = 30000;
const wsToken = "Htp5gITzKLJg";
const forwardConsole = {"enabled":false,"unhandledErrors":false,"logLevels":[]};
const transport = normalizeModuleRunnerTransport((() => {
	let wsTransport = createWebSocketModuleRunnerTransport({
		createConnection: () => new WebSocket(`${socketProtocol}://${socketHost}?token=${wsToken}`, "vite-hmr"),
		pingInterval: hmrTimeout
	});
	return {
		async connect(handlers) {
			try {
				await wsTransport.connect(handlers);
			} catch (e) {
				if (!hmrPort) {
					wsTransport = createWebSocketModuleRunnerTransport({
						createConnection: () => new WebSocket(`${socketProtocol}://${directSocketHost}?token=${wsToken}`, "vite-hmr"),
						pingInterval: hmrTimeout
					});
					try {
						await wsTransport.connect(handlers);
						console.info("[vite] Direct websocket connection fallback. Check out https://vite.dev/config/server-options.html#server-hmr to remove the previous connection error.");
					} catch (e) {
						if (e instanceof Error && e.message.includes("WebSocket closed without opened.")) {
							const currentScriptHostURL = new URL(import.meta.url);
							const currentScriptHost = currentScriptHostURL.host + currentScriptHostURL.pathname.replace(/@vite\/client$/, "");
							console.error(`[vite] failed to connect to websocket.
your current setup:
  (browser) ${currentScriptHost} <--[HTTP]--> ${serverHost} (server)\n  (browser) ${socketHost} <--[WebSocket (failing)]--> ${directSocketHost} (server)\nCheck out your Vite / network configuration and https://vite.dev/config/server-options.html#server-hmr .`);
						}
					}
					return;
				}
				console.error(`[vite] failed to connect to websocket (${e}). `);
				throw e;
			}
		},
		async disconnect() {
			await wsTransport.disconnect();
		},
		send(data) {
			wsTransport.send(data);
		}
	};
})());
let willUnload = false;
if (typeof window !== "undefined") window.addEventListener?.("beforeunload", () => {
	willUnload = true;
});
function cleanUrl(pathname) {
	const url = new URL(pathname, "http://vite.dev");
	url.searchParams.delete("direct");
	return url.pathname + url.search;
}
let isFirstUpdate = true;
const outdatedLinkTags = /* @__PURE__ */ new WeakSet();
const debounceReload = (time) => {
	let timer;
	return () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		timer = setTimeout(() => {
			location.reload();
		}, time);
	};
};
const pageReload = debounceReload(20);
const hmrClient = new HMRClient({
	error: (err) => console.error("[vite]", err),
	debug: (...msg) => console.debug("[vite]", ...msg)
}, transport, async function importUpdatedModule({ acceptedPath, timestamp, explicitImportRequired, isWithinCircularImport }) {
	const [acceptedPathWithoutQuery, query] = acceptedPath.split(`?`);
	const importPromise = import(
		/* @vite-ignore */
		moduleUrlToBrowserUrl(`${acceptedPathWithoutQuery}?${explicitImportRequired ? "import&" : ""}t=${timestamp}${query ? `&${query}` : ""}`, base)
);
	if (isWithinCircularImport) importPromise.catch(() => {
		console.info(`[hmr] ${acceptedPath} failed to apply HMR as it's within a circular import. Reloading page to reset the execution order. To debug and break the circular import, you can run \`vite --debug hmr\` to log the circular dependency path if a file change triggered it.`);
		pageReload();
	});
	return await importPromise;
});
let bundledDevClient;
transport.connect(createHMRHandler(handleMessage));
setupForwardConsoleHandler(transport, forwardConsole);
function clearOverlayOrReloadOnFirstUpdate() {
	if (hasDocument) {
		if (isFirstUpdate && hasErrorOverlay()) {
			location.reload();
			return "reload";
		}
		if (enableOverlay) clearErrorOverlay();
		isFirstUpdate = false;
	}
	return "continue";
}
async function handleMessage(payload) {
	const activeHmrClient = hmrClient;
	switch (payload.type) {
		case "connected":
			console.debug(`[vite] connected.`);
			break;
		case "bundled-dev-update":
			bundledDevClient.handlePush(payload);
			break;
		case "update":
			await activeHmrClient.notifyListeners("vite:beforeUpdate", payload);
			if (clearOverlayOrReloadOnFirstUpdate() === "reload") return;
			await Promise.all(payload.updates.map(async (update) => {
				if (update.type === "js-update") return hmrClient.queueUpdate(update);
				const { path, timestamp } = update;
				const searchUrl = cleanUrl(path);
				const el = Array.from(document.querySelectorAll("link")).find((e) => !outdatedLinkTags.has(e) && cleanUrl(e.href).includes(searchUrl));
				if (!el) return;
				const browserUrl = moduleUrlToBrowserUrl(`${searchUrl}${searchUrl.includes("?") ? "&" : "?"}t=${timestamp}`, base);
				return new Promise((resolve) => {
					const newLinkTag = el.cloneNode();
					newLinkTag.href = new URL(browserUrl, el.href).href;
					const removeOldEl = () => {
						el.remove();
						console.debug(`[vite] css hot updated: ${searchUrl}`);
						resolve();
					};
					newLinkTag.addEventListener("load", removeOldEl);
					newLinkTag.addEventListener("error", removeOldEl);
					outdatedLinkTags.add(el);
					el.after(newLinkTag);
				});
			}));
			await activeHmrClient.notifyListeners("vite:afterUpdate", payload);
			break;
		case "custom":
			await activeHmrClient.notifyListeners(payload.event, payload.data);
			if (payload.event === "vite:ws:disconnect") {
				if (hasDocument && !willUnload) {
					console.log(`[vite] server connection lost. Polling for restart...`);
					const socket = payload.data.webSocket;
					const url = new URL(socket.url);
					url.search = "";
					await waitForSuccessfulPing(url.href);
					location.reload();
				}
			}
			break;
		case "full-reload":
			if (payload.ifFallback && !globalThis.__vite_is_fallback_page__) break;
			await activeHmrClient.notifyListeners("vite:beforeFullReload", payload);
			if (hasDocument) {
				if (payload.path && payload.path.endsWith(".html")) {
					const pagePath = decodeURI(location.pathname);
					const payloadPath = base + payload.path.slice(1);
					if (pagePath === payloadPath || payload.path === "/index.html" || pagePath.endsWith("/") && pagePath + "index.html" === payloadPath) pageReload();
					return;
				} else pageReload();
			}
			break;
		case "prune":
			await activeHmrClient.notifyListeners("vite:beforePrune", payload);
			await activeHmrClient.prunePaths(payload.paths);
			break;
		case "error":
			await activeHmrClient.notifyListeners("vite:error", payload);
			if (hasDocument) {
				const err = payload.err;
				if (enableOverlay) createErrorOverlay(err);
				else console.error(`[vite] Internal Server Error\n${err.message}\n${err.stack}`);
			}
			break;
		case "ping": break;
		default: return payload;
	}
}
const enableOverlay = true;
const hasDocument = "document" in globalThis;
function createErrorOverlay(err) {
	clearErrorOverlay();
	const { customElements } = globalThis;
	if (customElements) {
		const ErrorOverlayConstructor = customElements.get(overlayId);
		document.body.appendChild(new ErrorOverlayConstructor(err));
	}
}
function clearErrorOverlay() {
	document.querySelectorAll(overlayId).forEach((n) => n.close());
}
function hasErrorOverlay() {
	return document.querySelectorAll(overlayId).length;
}
function waitForSuccessfulPing(socketUrl) {
	if (typeof SharedWorker === "undefined") {
		const visibilityManager = {
			currentState: document.visibilityState,
			listeners: /* @__PURE__ */ new Set()
		};
		const onVisibilityChange = () => {
			visibilityManager.currentState = document.visibilityState;
			for (const listener of visibilityManager.listeners) listener(visibilityManager.currentState);
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		return waitForSuccessfulPingInternal(socketUrl, visibilityManager);
	}
	const blob = new Blob([
		"\"use strict\";",
		`const waitForSuccessfulPingInternal = ${waitForSuccessfulPingInternal.toString()};`,
		`const fn = ${pingWorkerContentMain.toString()};`,
		`fn(${JSON.stringify(socketUrl)})`
	], { type: "application/javascript" });
	const objURL = URL.createObjectURL(blob);
	const sharedWorker = new SharedWorker(objURL);
	return new Promise((resolve, reject) => {
		const onVisibilityChange = () => {
			sharedWorker.port.postMessage({ visibility: document.visibilityState });
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		sharedWorker.port.addEventListener("message", (event) => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			sharedWorker.port.close();
			const data = event.data;
			if (data.type === "error") {
				reject(data.error);
				return;
			}
			resolve();
		});
		onVisibilityChange();
		sharedWorker.port.start();
	});
}
function pingWorkerContentMain(socketUrl) {
	self.addEventListener("connect", (_event) => {
		const port = _event.ports[0];
		if (!socketUrl) {
			port.postMessage({
				type: "error",
				error: /* @__PURE__ */ new Error("socketUrl not found")
			});
			return;
		}
		const visibilityManager = {
			currentState: "visible",
			listeners: /* @__PURE__ */ new Set()
		};
		port.addEventListener("message", (event) => {
			const { visibility } = event.data;
			visibilityManager.currentState = visibility;
			console.debug("[vite] new window visibility", visibility);
			for (const listener of visibilityManager.listeners) listener(visibility);
		});
		port.start();
		console.debug("[vite] connected from window");
		waitForSuccessfulPingInternal(socketUrl, visibilityManager).then(() => {
			console.debug("[vite] ping successful");
			try {
				port.postMessage({ type: "success" });
			} catch (error) {
				port.postMessage({
					type: "error",
					error
				});
			}
		}, (error) => {
			console.debug("[vite] error happened", error);
			try {
				port.postMessage({
					type: "error",
					error
				});
			} catch (error) {
				port.postMessage({
					type: "error",
					error
				});
			}
		});
	});
}
async function waitForSuccessfulPingInternal(socketUrl, visibilityManager, ms = 1e3) {
	function wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	async function ping() {
		try {
			const socket = new WebSocket(socketUrl, "vite-ping");
			return new Promise((resolve) => {
				function onOpen() {
					resolve(true);
					close();
				}
				function onError() {
					resolve(false);
					close();
				}
				function close() {
					socket.removeEventListener("open", onOpen);
					socket.removeEventListener("error", onError);
					socket.close();
				}
				socket.addEventListener("open", onOpen);
				socket.addEventListener("error", onError);
			});
		} catch {
			return false;
		}
	}
	function waitForWindowShow(visibilityManager) {
		return new Promise((resolve) => {
			const onChange = (newVisibility) => {
				if (newVisibility === "visible") {
					resolve();
					visibilityManager.listeners.delete(onChange);
				}
			};
			visibilityManager.listeners.add(onChange);
		});
	}
	if (await ping()) return;
	await wait(ms);
	while (true) if (visibilityManager.currentState === "visible") {
		if (await ping()) break;
		await wait(ms);
	} else await waitForWindowShow(visibilityManager);
}
const sheetsMap = /* @__PURE__ */ new Map();
const linkSheetsMap = /* @__PURE__ */ new Map();
if ("document" in globalThis) {
	document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
		sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
	});
	document.querySelectorAll("link[rel=\"stylesheet\"][data-vite-dev-id]").forEach((el) => {
		linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
	});
}
let lastInsertedStyle;
function updateStyle(id, content) {
	if (linkSheetsMap.has(id)) return;
	let style = sheetsMap.get(id);
	if (!style) {
		style = document.createElement("style");
		style.setAttribute("type", "text/css");
		style.setAttribute("data-vite-dev-id", id);
		style.textContent = content;
		if (cspNonce) style.setAttribute("nonce", cspNonce);
		if (!lastInsertedStyle) {
			document.head.appendChild(style);
			setTimeout(() => {
				lastInsertedStyle = void 0;
			}, 0);
		} else lastInsertedStyle.insertAdjacentElement("afterend", style);
		lastInsertedStyle = style;
	} else if (style.textContent !== content) style.textContent = content;
	sheetsMap.set(id, style);
}
function removeStyle(id) {
	if (linkSheetsMap.has(id)) {
		document.querySelectorAll(`link[rel="stylesheet"][data-vite-dev-id="${CSS.escape(id)}"]`).forEach((el) => el.remove());
		linkSheetsMap.delete(id);
	}
	const style = sheetsMap.get(id);
	if (style) {
		document.head.removeChild(style);
		sheetsMap.delete(id);
	}
}
function createHotContext(moduleUrl) {
	return new HMRContext(hmrClient, moduleUrl);
}
/**
* urls here are dynamic import() urls that couldn't be statically analyzed
*/
function injectQuery(url, queryToInject) {
	if (url[0] !== "." && url[0] !== "/") return url;
	const pathname = url.replace(/[?#].*$/, "");
	const { search, hash } = new URL(url, "http://vite.dev");
	return `${pathname}?${queryToInject}${search ? `&` + search.slice(1) : ""}${hash || ""}`;
}
//#endregion
export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsaWVudCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgXCIvbm9kZV9tb2R1bGVzLy5wbnBtL3ZpdGVAOC4zLjUvbm9kZV9tb2R1bGVzL3ZpdGUvZGlzdC9jbGllbnQvZW52Lm1qc1wiO1xuLy8jcmVnaW9uIC4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9uYW5vaWRANS4xLjE2L25vZGVfbW9kdWxlcy9uYW5vaWQvbm9uLXNlY3VyZS9pbmRleC5qc1xubGV0IHVybEFscGhhYmV0ID0gXCJ1c2VhbmRvbS0yNlQxOTgzNDBQWDc1cHhKQUNLVkVSWU1JTkRCVVNIV09MRl9HUVpiZmdoamtscXZ3eXpyaWN0XCI7XG5sZXQgbmFub2lkID0gKHNpemUgPSAyMSkgPT4ge1xuXHRsZXQgaWQgPSBcIlwiO1xuXHRsZXQgaSA9IHNpemUgfCAwO1xuXHR3aGlsZSAoaS0tID4gMCkgaWQgKz0gdXJsQWxwaGFiZXRbTWF0aC5yYW5kb20oKSAqIDY0IHwgMF07XG5cdHJldHVybiBpZDtcbn07XG4vLyNlbmRyZWdpb25cbi8vI3JlZ2lvbiBzcmMvc2hhcmVkL2NvbnN0YW50cy50c1xuLyoqXG4qIFByZWZpeCBmb3IgcmVzb2x2ZWQgSWRzIHRoYXQgYXJlIG5vdCB2YWxpZCBicm93c2VyIGltcG9ydCBzcGVjaWZpZXJzXG4qL1xuY29uc3QgVkFMSURfSURfUFJFRklYID0gYC9AaWQvYDtcbi8qKlxuKiBQbHVnaW5zIHRoYXQgdXNlICd2aXJ0dWFsIG1vZHVsZXMnIChlLmcuIGZvciBoZWxwZXIgZnVuY3Rpb25zKSwgcHJlZml4IHRoZVxuKiBtb2R1bGUgSUQgd2l0aCBgXFwwYCwgYSBjb252ZW50aW9uIGZyb20gdGhlIHJvbGx1cCBlY29zeXN0ZW0uXG4qIFRoaXMgcHJldmVudHMgb3RoZXIgcGx1Z2lucyBmcm9tIHRyeWluZyB0byBwcm9jZXNzIHRoZSBpZCAobGlrZSBub2RlIHJlc29sdXRpb24pLFxuKiBhbmQgY29yZSBmZWF0dXJlcyBsaWtlIHNvdXJjZW1hcHMgY2FuIHVzZSB0aGlzIGluZm8gdG8gZGlmZmVyZW50aWF0ZSBiZXR3ZWVuXG4qIHZpcnR1YWwgbW9kdWxlcyBhbmQgcmVndWxhciBmaWxlcy5cbiogYFxcMGAgaXMgbm90IGEgcGVybWl0dGVkIGNoYXIgaW4gaW1wb3J0IFVSTHMgc28gd2UgaGF2ZSB0byByZXBsYWNlIHRoZW0gZHVyaW5nXG4qIGltcG9ydCBhbmFseXNpcy4gVGhlIGlkIHdpbGwgYmUgZGVjb2RlZCBiYWNrIGJlZm9yZSBlbnRlcmluZyB0aGUgcGx1Z2lucyBwaXBlbGluZS5cbiogVGhlc2UgZW5jb2RlZCB2aXJ0dWFsIGlkcyBhcmUgYWxzbyBwcmVmaXhlZCBieSB0aGUgVkFMSURfSURfUFJFRklYLCBzbyB2aXJ0dWFsXG4qIG1vZHVsZXMgaW4gdGhlIGJyb3dzZXIgZW5kIHVwIGVuY29kZWQgYXMgYC9AaWQvX194MDBfX3tpZH1gXG4qL1xuY29uc3QgTlVMTF9CWVRFX1BMQUNFSE9MREVSID0gYF9feDAwX19gO1xubGV0IFNPVVJDRU1BUFBJTkdfVVJMID0gXCJzb3VyY2VNYVwiO1xuU09VUkNFTUFQUElOR19VUkwgKz0gXCJwcGluZ1VSTFwiO1xudHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2Vzcy5wbGF0Zm9ybTtcbi8qKlxuKiBQcmVwZW5kIGAvQGlkL2AgYW5kIHJlcGxhY2UgbnVsbCBieXRlIHNvIHRoZSBpZCBpcyBVUkwtc2FmZS5cbiogQnJvd3NlclVSTCByZW5kZXJpbmcgd3JhcHMgTW9kdWxlVVJMcyB0aGF0IGFyZSBub3QgdmFsaWQgYnJvd3NlciBpbXBvcnRcbiogc3BlY2lmaWVycyBiZWZvcmUgYWRkaW5nIGJhc2UuXG4qL1xuZnVuY3Rpb24gd3JhcElkKGlkKSB7XG5cdHJldHVybiBpZC5zdGFydHNXaXRoKFwiL0BpZC9cIikgPyBpZCA6IFZBTElEX0lEX1BSRUZJWCArIGlkLnJlcGxhY2UoXCJcXDBcIiwgTlVMTF9CWVRFX1BMQUNFSE9MREVSKTtcbn1cbi8qKiBSZW5kZXIgYSBkZWNvZGVkIE1vZHVsZVVSTCBhcyBhIEJyb3dzZXJVUkwsIHdyYXBwaW5nIHZpcnR1YWwgSURzIGFuZCBhZGRpbmcgYmFzZS4gKi9cbmZ1bmN0aW9uIG1vZHVsZVVybFRvQnJvd3NlclVybChtb2R1bGVVcmwsIGJhc2UpIHtcblx0Y29uc3QgYnJvd3NlclVybCA9IG1vZHVsZVVybFswXSAhPT0gXCIuXCIgJiYgbW9kdWxlVXJsWzBdICE9PSBcIi9cIiA/IHdyYXBJZChtb2R1bGVVcmwpIDogbW9kdWxlVXJsO1xuXHRyZXR1cm4gYmFzZSA/IGpvaW5VcmxTZWdtZW50cyhiYXNlLCBicm93c2VyVXJsKSA6IGJyb3dzZXJVcmw7XG59XG5mdW5jdGlvbiBqb2luVXJsU2VnbWVudHMoYSwgYikge1xuXHRpZiAoIWEgfHwgIWIpIHJldHVybiBhIHx8IGIgfHwgXCJcIjtcblx0aWYgKGEuZW5kc1dpdGgoXCIvXCIpKSBhID0gYS5zdWJzdHJpbmcoMCwgYS5sZW5ndGggLSAxKTtcblx0aWYgKGJbMF0gIT09IFwiL1wiKSBiID0gXCIvXCIgKyBiO1xuXHRyZXR1cm4gYSArIGI7XG59XG4oYXN5bmMgZnVuY3Rpb24oKSB7fSkuY29uc3RydWN0b3I7XG5mdW5jdGlvbiBwcm9taXNlV2l0aFJlc29sdmVycygpIHtcblx0bGV0IHJlc29sdmU7XG5cdGxldCByZWplY3Q7XG5cdHJldHVybiB7XG5cdFx0cHJvbWlzZTogbmV3IFByb21pc2UoKF9yZXNvbHZlLCBfcmVqZWN0KSA9PiB7XG5cdFx0XHRyZXNvbHZlID0gX3Jlc29sdmU7XG5cdFx0XHRyZWplY3QgPSBfcmVqZWN0O1xuXHRcdH0pLFxuXHRcdHJlc29sdmUsXG5cdFx0cmVqZWN0XG5cdH07XG59XG4vLyNlbmRyZWdpb25cbi8vI3JlZ2lvbiBzcmMvc2hhcmVkL21vZHVsZVJ1bm5lclRyYW5zcG9ydC50c1xuZnVuY3Rpb24gcmV2aXZlSW52b2tlRXJyb3IoZSkge1xuXHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihlLm1lc3NhZ2UgfHwgXCJVbmtub3duIGludm9rZSBlcnJvclwiKTtcblx0T2JqZWN0LmFzc2lnbihlcnJvciwgZSwgeyBydW5uZXJFcnJvcjogLyogQF9fUFVSRV9fICovIG5ldyBFcnJvcihcIlJ1bm5lckVycm9yXCIpIH0pO1xuXHRyZXR1cm4gZXJyb3I7XG59XG5jb25zdCBjcmVhdGVJbnZva2VhYmxlVHJhbnNwb3J0ID0gKHRyYW5zcG9ydCkgPT4ge1xuXHRpZiAodHJhbnNwb3J0Lmludm9rZSkgcmV0dXJuIHtcblx0XHQuLi50cmFuc3BvcnQsXG5cdFx0YXN5bmMgaW52b2tlKG5hbWUsIGRhdGEpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRyYW5zcG9ydC5pbnZva2Uoe1xuXHRcdFx0XHR0eXBlOiBcImN1c3RvbVwiLFxuXHRcdFx0XHRldmVudDogXCJ2aXRlOmludm9rZVwiLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0aWQ6IFwic2VuZFwiLFxuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0ZGF0YVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGlmIChcImVycm9yXCIgaW4gcmVzdWx0KSB0aHJvdyByZXZpdmVJbnZva2VFcnJvcihyZXN1bHQuZXJyb3IpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG5cdFx0fVxuXHR9O1xuXHRpZiAoIXRyYW5zcG9ydC5zZW5kIHx8ICF0cmFuc3BvcnQuY29ubmVjdCkgdGhyb3cgbmV3IEVycm9yKFwidHJhbnNwb3J0IG11c3QgaW1wbGVtZW50IHNlbmQgYW5kIGNvbm5lY3Qgd2hlbiBpbnZva2UgaXMgbm90IGltcGxlbWVudGVkXCIpO1xuXHRjb25zdCBycGNQcm9taXNlcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgTWFwKCk7XG5cdHJldHVybiB7XG5cdFx0Li4udHJhbnNwb3J0LFxuXHRcdGNvbm5lY3QoeyBvbk1lc3NhZ2UsIG9uRGlzY29ubmVjdGlvbiB9KSB7XG5cdFx0XHRyZXR1cm4gdHJhbnNwb3J0LmNvbm5lY3Qoe1xuXHRcdFx0XHRvbk1lc3NhZ2UocGF5bG9hZCkge1xuXHRcdFx0XHRcdGlmIChwYXlsb2FkLnR5cGUgPT09IFwiY3VzdG9tXCIgJiYgcGF5bG9hZC5ldmVudCA9PT0gXCJ2aXRlOmludm9rZVwiKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkYXRhID0gcGF5bG9hZC5kYXRhO1xuXHRcdFx0XHRcdFx0aWYgKGRhdGEuaWQuc3RhcnRzV2l0aChcInJlc3BvbnNlOlwiKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpbnZva2VJZCA9IGRhdGEuaWQuc2xpY2UoOSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb21pc2UgPSBycGNQcm9taXNlcy5nZXQoaW52b2tlSWQpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIXByb21pc2UpIHJldHVybjtcblx0XHRcdFx0XHRcdFx0aWYgKHByb21pc2UudGltZW91dElkKSBjbGVhclRpbWVvdXQocHJvbWlzZS50aW1lb3V0SWQpO1xuXHRcdFx0XHRcdFx0XHRycGNQcm9taXNlcy5kZWxldGUoaW52b2tlSWQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IGVycm9yLCByZXN1bHQgfSA9IGRhdGEuZGF0YTtcblx0XHRcdFx0XHRcdFx0aWYgKGVycm9yKSBwcm9taXNlLnJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0XHRcdGVsc2UgcHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b25NZXNzYWdlKHBheWxvYWQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRpc2Nvbm5lY3Rpb25cblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0ZGlzY29ubmVjdCgpIHtcblx0XHRcdHJwY1Byb21pc2VzLmZvckVhY2goKHByb21pc2UpID0+IHtcblx0XHRcdFx0cHJvbWlzZS5yZWplY3QoLyogQF9fUFVSRV9fICovIG5ldyBFcnJvcihgdHJhbnNwb3J0IHdhcyBkaXNjb25uZWN0ZWQsIGNhbm5vdCBjYWxsICR7SlNPTi5zdHJpbmdpZnkocHJvbWlzZS5uYW1lKX1gKSk7XG5cdFx0XHR9KTtcblx0XHRcdHJwY1Byb21pc2VzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm4gdHJhbnNwb3J0LmRpc2Nvbm5lY3Q/LigpO1xuXHRcdH0sXG5cdFx0c2VuZChkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdHJhbnNwb3J0LnNlbmQoZGF0YSk7XG5cdFx0fSxcblx0XHRhc3luYyBpbnZva2UobmFtZSwgZGF0YSkge1xuXHRcdFx0Y29uc3QgcHJvbWlzZUlkID0gbmFub2lkKCk7XG5cdFx0XHRjb25zdCB3cmFwcGVkRGF0YSA9IHtcblx0XHRcdFx0dHlwZTogXCJjdXN0b21cIixcblx0XHRcdFx0ZXZlbnQ6IFwidml0ZTppbnZva2VcIixcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0aWQ6IGBzZW5kOiR7cHJvbWlzZUlkfWAsXG5cdFx0XHRcdFx0ZGF0YVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2VuZFByb21pc2UgPSB0cmFuc3BvcnQuc2VuZCh3cmFwcGVkRGF0YSk7XG5cdFx0XHRjb25zdCB7IHByb21pc2UsIHJlc29sdmUsIHJlamVjdCB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnMoKTtcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSB0cmFuc3BvcnQudGltZW91dCA/PyA2ZTQ7XG5cdFx0XHRsZXQgdGltZW91dElkO1xuXHRcdFx0aWYgKHRpbWVvdXQgPiAwKSB7XG5cdFx0XHRcdHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHJwY1Byb21pc2VzLmRlbGV0ZShwcm9taXNlSWQpO1xuXHRcdFx0XHRcdHJlamVjdCgvKiBAX19QVVJFX18gKi8gbmV3IEVycm9yKGB0cmFuc3BvcnQgaW52b2tlIHRpbWVkIG91dCBhZnRlciAke3RpbWVvdXR9bXMgKGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkod3JhcHBlZERhdGEpfSlgKSk7XG5cdFx0XHRcdH0sIHRpbWVvdXQpO1xuXHRcdFx0XHR0aW1lb3V0SWQ/LnVucmVmPy4oKTtcblx0XHRcdH1cblx0XHRcdHJwY1Byb21pc2VzLnNldChwcm9taXNlSWQsIHtcblx0XHRcdFx0cmVzb2x2ZSxcblx0XHRcdFx0cmVqZWN0LFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHR0aW1lb3V0SWRcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHNlbmRQcm9taXNlKSBzZW5kUHJvbWlzZS5jYXRjaCgoZXJyKSA9PiB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuXHRcdFx0XHRycGNQcm9taXNlcy5kZWxldGUocHJvbWlzZUlkKTtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBwcm9taXNlO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRocm93IHJldml2ZUludm9rZUVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufTtcbmNvbnN0IG5vcm1hbGl6ZU1vZHVsZVJ1bm5lclRyYW5zcG9ydCA9ICh0cmFuc3BvcnQpID0+IHtcblx0Y29uc3QgaW52b2tlYWJsZVRyYW5zcG9ydCA9IGNyZWF0ZUludm9rZWFibGVUcmFuc3BvcnQodHJhbnNwb3J0KTtcblx0bGV0IGlzQ29ubmVjdGVkID0gIWludm9rZWFibGVUcmFuc3BvcnQuY29ubmVjdDtcblx0bGV0IGNvbm5lY3RpbmdQcm9taXNlO1xuXHRyZXR1cm4ge1xuXHRcdC4uLnRyYW5zcG9ydCxcblx0XHQuLi5pbnZva2VhYmxlVHJhbnNwb3J0LmNvbm5lY3QgPyB7IGFzeW5jIGNvbm5lY3Qob25NZXNzYWdlKSB7XG5cdFx0XHRpZiAoaXNDb25uZWN0ZWQpIHJldHVybjtcblx0XHRcdGlmIChjb25uZWN0aW5nUHJvbWlzZSkge1xuXHRcdFx0XHRhd2FpdCBjb25uZWN0aW5nUHJvbWlzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWF5YmVQcm9taXNlID0gaW52b2tlYWJsZVRyYW5zcG9ydC5jb25uZWN0KHtcblx0XHRcdFx0b25NZXNzYWdlOiBvbk1lc3NhZ2UgPz8gKCgpID0+IHt9KSxcblx0XHRcdFx0b25EaXNjb25uZWN0aW9uKCkge1xuXHRcdFx0XHRcdGlzQ29ubmVjdGVkID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aWYgKG1heWJlUHJvbWlzZSkge1xuXHRcdFx0XHRjb25uZWN0aW5nUHJvbWlzZSA9IG1heWJlUHJvbWlzZTtcblx0XHRcdFx0YXdhaXQgY29ubmVjdGluZ1Byb21pc2U7XG5cdFx0XHRcdGNvbm5lY3RpbmdQcm9taXNlID0gdm9pZCAwO1xuXHRcdFx0fVxuXHRcdFx0aXNDb25uZWN0ZWQgPSB0cnVlO1xuXHRcdH0gfSA6IHt9LFxuXHRcdC4uLmludm9rZWFibGVUcmFuc3BvcnQuZGlzY29ubmVjdCA/IHsgYXN5bmMgZGlzY29ubmVjdCgpIHtcblx0XHRcdGlmICghaXNDb25uZWN0ZWQpIHJldHVybjtcblx0XHRcdGlmIChjb25uZWN0aW5nUHJvbWlzZSkgYXdhaXQgY29ubmVjdGluZ1Byb21pc2U7XG5cdFx0XHRpc0Nvbm5lY3RlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgaW52b2tlYWJsZVRyYW5zcG9ydC5kaXNjb25uZWN0KCk7XG5cdFx0fSB9IDoge30sXG5cdFx0YXN5bmMgc2VuZChkYXRhKSB7XG5cdFx0XHRpZiAoIWludm9rZWFibGVUcmFuc3BvcnQuc2VuZCkgcmV0dXJuO1xuXHRcdFx0aWYgKCFpc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRpZiAoY29ubmVjdGluZ1Byb21pc2UpIGF3YWl0IGNvbm5lY3RpbmdQcm9taXNlO1xuXHRcdFx0XHRlbHNlIHRocm93IG5ldyBTZW5kQmVmb3JlQ29ubmVjdEVycm9yKFwic2VuZCB3YXMgY2FsbGVkIGJlZm9yZSBjb25uZWN0XCIpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgaW52b2tlYWJsZVRyYW5zcG9ydC5zZW5kKGRhdGEpO1xuXHRcdH0sXG5cdFx0YXN5bmMgaW52b2tlKG5hbWUsIGRhdGEpIHtcblx0XHRcdGlmICghaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0aWYgKGNvbm5lY3RpbmdQcm9taXNlKSBhd2FpdCBjb25uZWN0aW5nUHJvbWlzZTtcblx0XHRcdFx0ZWxzZSB0aHJvdyBuZXcgU2VuZEJlZm9yZUNvbm5lY3RFcnJvcihcImludm9rZSB3YXMgY2FsbGVkIGJlZm9yZSBjb25uZWN0XCIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGludm9rZWFibGVUcmFuc3BvcnQuaW52b2tlKG5hbWUsIGRhdGEpO1xuXHRcdH1cblx0fTtcbn07XG52YXIgU2VuZEJlZm9yZUNvbm5lY3RFcnJvciA9IGNsYXNzIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdFx0dGhpcy5uYW1lID0gXCJTZW5kQmVmb3JlQ29ubmVjdEVycm9yXCI7XG5cdH1cbn07XG5jb25zdCBjcmVhdGVXZWJTb2NrZXRNb2R1bGVSdW5uZXJUcmFuc3BvcnQgPSAob3B0aW9ucykgPT4ge1xuXHRjb25zdCBwaW5nSW50ZXJ2YWwgPSBvcHRpb25zLnBpbmdJbnRlcnZhbCA/PyAzZTQ7XG5cdGxldCB3cztcblx0bGV0IHBpbmdJbnRlcnZhbElkO1xuXHRyZXR1cm4ge1xuXHRcdGFzeW5jIGNvbm5lY3QoeyBvbk1lc3NhZ2UsIG9uRGlzY29ubmVjdGlvbiB9KSB7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBvcHRpb25zLmNyZWF0ZUNvbm5lY3Rpb24oKTtcblx0XHRcdHNvY2tldC5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCAoeyBkYXRhIH0pID0+IHtcblx0XHRcdFx0b25NZXNzYWdlKEpTT04ucGFyc2UoZGF0YSkpO1xuXHRcdFx0fSk7XG5cdFx0XHRsZXQgaXNPcGVuZWQgPSBzb2NrZXQucmVhZHlTdGF0ZSA9PT0gc29ja2V0Lk9QRU47XG5cdFx0XHRpZiAoIWlzT3BlbmVkKSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHNvY2tldC5hZGRFdmVudExpc3RlbmVyKFwib3BlblwiLCAoKSA9PiB7XG5cdFx0XHRcdFx0aXNPcGVuZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSwgeyBvbmNlOiB0cnVlIH0pO1xuXHRcdFx0XHRzb2NrZXQuYWRkRXZlbnRMaXN0ZW5lcihcImNsb3NlXCIsICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzT3BlbmVkKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QoLyogQF9fUFVSRV9fICovIG5ldyBFcnJvcihcIldlYlNvY2tldCBjbG9zZWQgd2l0aG91dCBvcGVuZWQuXCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b25NZXNzYWdlKHtcblx0XHRcdFx0XHRcdHR5cGU6IFwiY3VzdG9tXCIsXG5cdFx0XHRcdFx0XHRldmVudDogXCJ2aXRlOndzOmRpc2Nvbm5lY3RcIixcblx0XHRcdFx0XHRcdGRhdGE6IHsgd2ViU29ja2V0OiBzb2NrZXQgfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdG9uRGlzY29ubmVjdGlvbigpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0b25NZXNzYWdlKHtcblx0XHRcdFx0dHlwZTogXCJjdXN0b21cIixcblx0XHRcdFx0ZXZlbnQ6IFwidml0ZTp3czpjb25uZWN0XCIsXG5cdFx0XHRcdGRhdGE6IHsgd2ViU29ja2V0OiBzb2NrZXQgfVxuXHRcdFx0fSk7XG5cdFx0XHR3cyA9IHNvY2tldDtcblx0XHRcdHBpbmdJbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0XHRpZiAoc29ja2V0LnJlYWR5U3RhdGUgPT09IHNvY2tldC5PUEVOKSBzb2NrZXQuc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6IFwicGluZ1wiIH0pKTtcblx0XHRcdH0sIHBpbmdJbnRlcnZhbCk7XG5cdFx0fSxcblx0XHRkaXNjb25uZWN0KCkge1xuXHRcdFx0Y2xlYXJJbnRlcnZhbChwaW5nSW50ZXJ2YWxJZCk7XG5cdFx0XHR3cz8uY2xvc2UoKTtcblx0XHR9LFxuXHRcdHNlbmQoZGF0YSkge1xuXHRcdFx0d3Muc2VuZChKU09OLnN0cmluZ2lmeShkYXRhKSk7XG5cdFx0fVxuXHR9O1xufTtcbi8vI2VuZHJlZ2lvblxuLy8jcmVnaW9uIHNyYy9zaGFyZWQvcHJldHR5LWZvcm1hdC50c1xuY29uc3QgREVGQVVMVF9PUFRJT05TID0ge1xuXHRtYXhEZXB0aDogMyxcblx0bWF4V2lkdGg6IDEwMFxufTtcbmNvbnN0IG9iamVjdFRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcbmNvbnN0IGVycm9yVG9TdHJpbmcgPSBFcnJvci5wcm90b3R5cGUudG9TdHJpbmc7XG5jb25zdCBpZGVudGlmaWVyUkUgPSAvXlthLXpfJF1bXFx3JF0qJC9pO1xuZnVuY3Rpb24gcHJldHR5Rm9ybWF0KHZhbHVlLCBvcHRpb25zID0ge30pIHtcblx0cmV0dXJuIHByaW50ZXIodmFsdWUsIHtcblx0XHQuLi5ERUZBVUxUX09QVElPTlMsXG5cdFx0Li4ub3B0aW9uc1xuXHR9LCAwLCBbXSk7XG59XG5mdW5jdGlvbiBwcmludGVyKHZhbHVlLCBjb25maWcsIGRlcHRoLCByZWZzKSB7XG5cdHJldHVybiBwcmludEJhc2ljVmFsdWUodmFsdWUpID8/IHByaW50Q29tcGxleFZhbHVlKHZhbHVlLCBjb25maWcsIGRlcHRoLCByZWZzKTtcbn1cbmZ1bmN0aW9uIHByaW50QmFzaWNWYWx1ZSh2YWx1ZSkge1xuXHRpZiAodmFsdWUgPT0gbnVsbCkgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpIHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIpIHJldHVybiBPYmplY3QuaXModmFsdWUsIC0wKSA/IFwiLTBcIiA6IFN0cmluZyh2YWx1ZSk7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09IFwiYmlnaW50XCIpIHJldHVybiBgJHt2YWx1ZX1uYDtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJib29sZWFuXCIgfHwgdHlwZW9mIHZhbHVlID09PSBcInN5bWJvbFwiKSByZXR1cm4gU3RyaW5nKHZhbHVlKTtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiKSByZXR1cm4gdmFsdWUubmFtZSA/IGBbRnVuY3Rpb246ICR7dmFsdWUubmFtZX1dYCA6IFwiW0Z1bmN0aW9uXVwiO1xuXHRjb25zdCB0eXBlID0gb2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG5cdGlmICh0eXBlID09PSBcIltvYmplY3QgRGF0ZV1cIikgcmV0dXJuIE51bWJlci5pc05hTigrdmFsdWUpID8gXCJEYXRlIHsgTmFOIH1cIiA6IHZhbHVlLnRvSVNPU3RyaW5nKCk7XG5cdGlmICh0eXBlID09PSBcIltvYmplY3QgRXJyb3JdXCIgfHwgdmFsdWUgaW5zdGFuY2VvZiBFcnJvcikgcmV0dXJuIGBbJHtlcnJvclRvU3RyaW5nLmNhbGwodmFsdWUpfV1gO1xufVxuZnVuY3Rpb24gcHJpbnRDb21wbGV4VmFsdWUodmFsdWUsIGNvbmZpZywgZGVwdGgsIHJlZnMpIHtcblx0aWYgKHJlZnMuaW5jbHVkZXModmFsdWUpKSByZXR1cm4gXCJbQ2lyY3VsYXJdXCI7XG5cdHJlZnMgPSBbLi4ucmVmcywgdmFsdWVdO1xuXHRjb25zdCBoaXRNYXhEZXB0aCA9ICsrZGVwdGggPiBjb25maWcubWF4RGVwdGg7XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIGhpdE1heERlcHRoID8gXCJbQXJyYXldXCIgOiBgWyR7cHJpbnRMaXN0SXRlbXModmFsdWUsIGNvbmZpZywgZGVwdGgsIHJlZnMpfV1gO1xuXHRyZXR1cm4gaGl0TWF4RGVwdGggPyBcIltPYmplY3RdXCIgOiBgeyR7cHJpbnRPYmplY3RQcm9wZXJ0aWVzKHZhbHVlLCBjb25maWcsIGRlcHRoLCByZWZzKX19YDtcbn1cbmZ1bmN0aW9uIHByaW50TGlzdEl0ZW1zKHZhbHVlLCBjb25maWcsIGRlcHRoLCByZWZzKSB7XG5cdGNvbnN0IHdpZHRoID0gTWF0aC5taW4odmFsdWUubGVuZ3RoLCBjb25maWcubWF4V2lkdGgpO1xuXHRjb25zdCByZXN1bHQgPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB3aWR0aDsgaSsrKSByZXN1bHQucHVzaChpIGluIHZhbHVlID8gcHJpbnRlcih2YWx1ZVtpXSwgY29uZmlnLCBkZXB0aCwgcmVmcykgOiBcIlwiKTtcblx0aWYgKHdpZHRoIDwgdmFsdWUubGVuZ3RoKSByZXN1bHQucHVzaChg4oCmKCR7dmFsdWUubGVuZ3RoIC0gd2lkdGh9KWApO1xuXHRyZXR1cm4gd2l0aFNwYWNpbmcocmVzdWx0KTtcbn1cbmZ1bmN0aW9uIHByaW50T2JqZWN0UHJvcGVydGllcyh2YWx1ZSwgY29uZmlnLCBkZXB0aCwgcmVmcykge1xuXHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuXHRjb25zdCB3aWR0aCA9IE1hdGgubWluKGtleXMubGVuZ3RoLCBjb25maWcubWF4V2lkdGgpO1xuXHRjb25zdCByZXN1bHQgPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB3aWR0aDsgaSsrKSB7XG5cdFx0Y29uc3Qga2V5ID0ga2V5c1tpXTtcblx0XHRjb25zdCBuYW1lID0ga2V5ICE9PSBcIl9fcHJvdG9fX1wiICYmIGlkZW50aWZpZXJSRS50ZXN0KGtleSkgPyBrZXkgOiBKU09OLnN0cmluZ2lmeShrZXkpO1xuXHRcdHJlc3VsdC5wdXNoKGAke25hbWV9OiAke3ByaW50ZXIodmFsdWVba2V5XSwgY29uZmlnLCBkZXB0aCwgcmVmcyl9YCk7XG5cdH1cblx0aWYgKHdpZHRoIDwga2V5cy5sZW5ndGgpIHJlc3VsdC5wdXNoKGDigKYoJHtrZXlzLmxlbmd0aCAtIHdpZHRofSlgKTtcblx0cmV0dXJuIHdpdGhTcGFjaW5nKHJlc3VsdCk7XG59XG5mdW5jdGlvbiB3aXRoU3BhY2luZyh2YWx1ZXMpIHtcblx0cmV0dXJuIHZhbHVlcy5sZW5ndGggPT09IDAgPyBcIlwiIDogYCAke3ZhbHVlcy5qb2luKFwiLCBcIil9IGA7XG59XG4vLyNlbmRyZWdpb25cbi8vI3JlZ2lvbiBzcmMvc2hhcmVkL2ZvcndhcmRDb25zb2xlLnRzXG5mdW5jdGlvbiBzZXR1cEZvcndhcmRDb25zb2xlSGFuZGxlcih0cmFuc3BvcnQsIG9wdGlvbnMsIGNvbnNvbGUgPSBnbG9iYWxUaGlzLmNvbnNvbGUpIHtcblx0aWYgKCFvcHRpb25zLmVuYWJsZWQpIHJldHVybjtcblx0YXN5bmMgZnVuY3Rpb24gc2VuZEVycm9yKHR5cGUsIGVycm9yKSB7XG5cdFx0YXdhaXQgdHJhbnNwb3J0LnNlbmQoe1xuXHRcdFx0dHlwZTogXCJjdXN0b21cIixcblx0XHRcdGV2ZW50OiBcInZpdGU6Zm9yd2FyZC1jb25zb2xlXCIsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRuYW1lOiBlcnJvcj8ubmFtZSB8fCBcIlVua25vd24gRXJyb3JcIixcblx0XHRcdFx0XHRtZXNzYWdlOiBlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpLFxuXHRcdFx0XHRcdHN0YWNrOiBlcnJvcj8uc3RhY2tcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIGZ1bmN0aW9uIHNlbmRMb2cobGV2ZWwsIGFyZ3MpIHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnNlbmQoe1xuXHRcdFx0XHR0eXBlOiBcImN1c3RvbVwiLFxuXHRcdFx0XHRldmVudDogXCJ2aXRlOmZvcndhcmQtY29uc29sZVwiLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dHlwZTogXCJsb2dcIixcblx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHRsZXZlbCxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IHRydW5jYXRlQ29uc29sZU1lc3NhZ2UoZm9ybWF0Q29uc29sZUFyZ3MoYXJncykpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHNlbmRFcnJvcihcInVuaGFuZGxlZC1yZWplY3Rpb25cIiwgZXJyKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoIShlcnIgaW5zdGFuY2VvZiBTZW5kQmVmb3JlQ29ubmVjdEVycm9yKSkgb3JpZ2luYWxDb25zb2xlRXJyb3IoXCJGYWlsZWQgdG8gc2VuZCBlcnJvciB0byBWaXRlIHNlcnZlcjpcIiwgZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Y29uc3Qgb3JpZ2luYWxDb25zb2xlRXJyb3IgPSBjb25zb2xlLmVycm9yO1xuXHRmb3IgKGNvbnN0IGxldmVsIG9mIG9wdGlvbnMubG9nTGV2ZWxzKSB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBjb25zb2xlW2xldmVsXTtcblx0XHRpZiAodHlwZW9mIG9yaWdpbmFsICE9PSBcImZ1bmN0aW9uXCIpIGNvbnRpbnVlO1xuXHRcdGNvbnNvbGVbbGV2ZWxdID0gKC4uLmFyZ3MpID0+IHtcblx0XHRcdG9yaWdpbmFsKC4uLmFyZ3MpO1xuXHRcdFx0c2VuZExvZyhsZXZlbCwgYXJncyk7XG5cdFx0fTtcblx0fVxuXHRpZiAob3B0aW9ucy51bmhhbmRsZWRFcnJvcnMgJiYgdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgYXN5bmMgKGV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvciA9IGV2ZW50LmVycm9yID8/IChldmVudC5tZXNzYWdlID8gbmV3IEVycm9yKGV2ZW50Lm1lc3NhZ2UpIDogZXZlbnQpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc2VuZEVycm9yKFwiZXJyb3JcIiwgZXJyb3IpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGlmICghKGVyciBpbnN0YW5jZW9mIFNlbmRCZWZvcmVDb25uZWN0RXJyb3IpKSBvcmlnaW5hbENvbnNvbGVFcnJvcihcIkZhaWxlZCB0byBzZW5kIGVycm9yIHRvIFZpdGUgc2VydmVyOlwiLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwidW5oYW5kbGVkcmVqZWN0aW9uXCIsIGFzeW5jIChldmVudCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc2VuZEVycm9yKFwidW5oYW5kbGVkLXJlamVjdGlvblwiLCBldmVudC5yZWFzb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGlmICghKGVyciBpbnN0YW5jZW9mIFNlbmRCZWZvcmVDb25uZWN0RXJyb3IpKSBvcmlnaW5hbENvbnNvbGVFcnJvcihcIkZhaWxlZCB0byBzZW5kIGVycm9yIHRvIFZpdGUgc2VydmVyOlwiLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5mdW5jdGlvbiBmb3JtYXRDb25zb2xlQXJncyhhcmdzKSB7XG5cdGlmIChhcmdzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiXCI7XG5cdGlmICh0eXBlb2YgYXJnc1swXSAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIGFyZ3MubWFwKChhcmcpID0+IHN0cmluZ2lmeUNvbnNvbGVBcmcoYXJnKSkuam9pbihcIiBcIik7XG5cdGNvbnN0IGxlbiA9IGFyZ3MubGVuZ3RoO1xuXHRsZXQgaSA9IDE7XG5cdGxldCBtZXNzYWdlID0gYXJnc1swXS5yZXBsYWNlKC8lW3Nkamlmb09jJV0vZywgKHNwZWNpZmllcikgPT4ge1xuXHRcdGlmIChzcGVjaWZpZXIgPT09IFwiJSVcIikgcmV0dXJuIFwiJVwiO1xuXHRcdGlmIChpID49IGxlbikgcmV0dXJuIHNwZWNpZmllcjtcblx0XHRjb25zdCBhcmcgPSBhcmdzW2krK107XG5cdFx0c3dpdGNoIChzcGVjaWZpZXIpIHtcblx0XHRcdGNhc2UgXCIlc1wiOlxuXHRcdFx0XHRpZiAodHlwZW9mIGFyZyA9PT0gXCJiaWdpbnRcIikgcmV0dXJuIGAke2FyZy50b1N0cmluZygpfW5gO1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIGFyZyA9PT0gXCJvYmplY3RcIiAmJiBhcmcgIT0gbnVsbCA/IHN0cmluZ2lmeUNvbnNvbGVBcmcoYXJnKSA6IFN0cmluZyhhcmcpO1xuXHRcdFx0Y2FzZSBcIiVkXCI6XG5cdFx0XHRcdGlmICh0eXBlb2YgYXJnID09PSBcImJpZ2ludFwiKSByZXR1cm4gYCR7YXJnLnRvU3RyaW5nKCl9bmA7XG5cdFx0XHRcdGlmICh0eXBlb2YgYXJnID09PSBcInN5bWJvbFwiKSByZXR1cm4gXCJOYU5cIjtcblx0XHRcdFx0cmV0dXJuIE51bWJlcihhcmcpLnRvU3RyaW5nKCk7XG5cdFx0XHRjYXNlIFwiJWlcIjpcblx0XHRcdFx0aWYgKHR5cGVvZiBhcmcgPT09IFwiYmlnaW50XCIpIHJldHVybiBgJHthcmcudG9TdHJpbmcoKX1uYDtcblx0XHRcdFx0cmV0dXJuIE51bWJlci5wYXJzZUludChTdHJpbmcoYXJnKSwgMTApLnRvU3RyaW5nKCk7XG5cdFx0XHRjYXNlIFwiJWZcIjogcmV0dXJuIE51bWJlci5wYXJzZUZsb2F0KFN0cmluZyhhcmcpKS50b1N0cmluZygpO1xuXHRcdFx0Y2FzZSBcIiVvXCI6XG5cdFx0XHRjYXNlIFwiJU9cIjogcmV0dXJuIHN0cmluZ2lmeUNvbnNvbGVBcmcoYXJnKTtcblx0XHRcdGNhc2UgXCIlalwiOiB0cnkge1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnKSA/PyBcInVuZGVmaW5lZFwiO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiBcIltDaXJjdWxhcl1cIjtcblx0XHRcdH1cblx0XHRcdGNhc2UgXCIlY1wiOiByZXR1cm4gXCJcIjtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBzcGVjaWZpZXI7XG5cdFx0fVxuXHR9KTtcblx0Zm9yIChsZXQgYXJnID0gYXJnc1tpXTsgaSA8IGxlbjsgYXJnID0gYXJnc1srK2ldKSBpZiAoYXJnID09IG51bGwgfHwgdHlwZW9mIGFyZyAhPT0gXCJvYmplY3RcIikgbWVzc2FnZSArPSBgICR7dHlwZW9mIGFyZyA9PT0gXCJzeW1ib2xcIiA/IGFyZy50b1N0cmluZygpIDogU3RyaW5nKGFyZyl9YDtcblx0ZWxzZSBtZXNzYWdlICs9IGAgJHtzdHJpbmdpZnlDb25zb2xlQXJnKGFyZyl9YDtcblx0cmV0dXJuIG1lc3NhZ2U7XG59XG5mdW5jdGlvbiBzdHJpbmdpZnlDb25zb2xlQXJnKHZhbHVlKSB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpIHJldHVybiB2YWx1ZTtcblx0aWYgKHZhbHVlIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiB2YWx1ZS5zdGFjayB8fCBgJHt2YWx1ZS5uYW1lfTogJHt2YWx1ZS5tZXNzYWdlfWA7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIHByZXR0eUZvcm1hdCh2YWx1ZSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBTdHJpbmcodmFsdWUpO1xuXHR9XG59XG5jb25zdCBNQVhfQ09OU09MRV9NRVNTQUdFX0xFTkdUSCA9IDFlNDtcbmZ1bmN0aW9uIHRydW5jYXRlQ29uc29sZU1lc3NhZ2UobWVzc2FnZSkge1xuXHRpZiAobWVzc2FnZS5sZW5ndGggPD0gTUFYX0NPTlNPTEVfTUVTU0FHRV9MRU5HVEgpIHJldHVybiBtZXNzYWdlO1xuXHRsZXQgZW5kID0gOTk5OTtcblx0aWYgKGlzSGlnaFN1cnJvZ2F0ZShtZXNzYWdlW2VuZCAtIDFdKSkgZW5kLS07XG5cdHJldHVybiBgJHttZXNzYWdlLnNsaWNlKDAsIGVuZCl94oCmYDtcbn1cbmZ1bmN0aW9uIGlzSGlnaFN1cnJvZ2F0ZSh2YWx1ZSkge1xuXHRyZXR1cm4gdmFsdWUgPj0gXCJcXHVkODAwXCIgJiYgdmFsdWUgPD0gXCJcXHVkYmZmXCI7XG59XG4vLyNlbmRyZWdpb25cbi8vI3JlZ2lvbiBcXDBAb3hjLXByb2plY3QrcnVudGltZUAwLjE1NC4wL2hlbHBlcnMvZXNtL3R5cGVvZi5qc1xuZnVuY3Rpb24gX3R5cGVvZihvKSB7XG5cdFwiQGJhYmVsL2hlbHBlcnMgLSB0eXBlb2ZcIjtcblx0cmV0dXJuIF90eXBlb2YgPSBcImZ1bmN0aW9uXCIgPT0gdHlwZW9mIFN5bWJvbCAmJiBcInN5bWJvbFwiID09IHR5cGVvZiBTeW1ib2wuaXRlcmF0b3IgPyBmdW5jdGlvbihvKSB7XG5cdFx0cmV0dXJuIHR5cGVvZiBvO1xuXHR9IDogZnVuY3Rpb24obykge1xuXHRcdHJldHVybiBvICYmIFwiZnVuY3Rpb25cIiA9PSB0eXBlb2YgU3ltYm9sICYmIG8uY29uc3RydWN0b3IgPT09IFN5bWJvbCAmJiBvICE9PSBTeW1ib2wucHJvdG90eXBlID8gXCJzeW1ib2xcIiA6IHR5cGVvZiBvO1xuXHR9LCBfdHlwZW9mKG8pO1xufVxuLy8jZW5kcmVnaW9uXG4vLyNyZWdpb24gXFwwQG94Yy1wcm9qZWN0K3J1bnRpbWVAMC4xNTQuMC9oZWxwZXJzL2VzbS90b1ByaW1pdGl2ZS5qc1xuZnVuY3Rpb24gdG9QcmltaXRpdmUodCwgcikge1xuXHRpZiAoXCJvYmplY3RcIiAhPSBfdHlwZW9mKHQpIHx8ICF0KSByZXR1cm4gdDtcblx0dmFyIGUgPSB0W1N5bWJvbC50b1ByaW1pdGl2ZV07XG5cdGlmICh2b2lkIDAgIT09IGUpIHtcblx0XHR2YXIgaSA9IGUuY2FsbCh0LCByIHx8IFwiZGVmYXVsdFwiKTtcblx0XHRpZiAoXCJvYmplY3RcIiAhPSBfdHlwZW9mKGkpKSByZXR1cm4gaTtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKFwiQEB0b1ByaW1pdGl2ZSBtdXN0IHJldHVybiBhIHByaW1pdGl2ZSB2YWx1ZS5cIik7XG5cdH1cblx0cmV0dXJuIChcInN0cmluZ1wiID09PSByID8gU3RyaW5nIDogTnVtYmVyKSh0KTtcbn1cbi8vI2VuZHJlZ2lvblxuLy8jcmVnaW9uIFxcMEBveGMtcHJvamVjdCtydW50aW1lQDAuMTU0LjAvaGVscGVycy9lc20vdG9Qcm9wZXJ0eUtleS5qc1xuZnVuY3Rpb24gdG9Qcm9wZXJ0eUtleSh0KSB7XG5cdHZhciBpID0gdG9QcmltaXRpdmUodCwgXCJzdHJpbmdcIik7XG5cdHJldHVybiBcInN5bWJvbFwiID09IF90eXBlb2YoaSkgPyBpIDogaSArIFwiXCI7XG59XG4vLyNlbmRyZWdpb25cbi8vI3JlZ2lvbiBcXDBAb3hjLXByb2plY3QrcnVudGltZUAwLjE1NC4wL2hlbHBlcnMvZXNtL2RlZmluZVByb3BlcnR5LmpzXG5mdW5jdGlvbiBfZGVmaW5lUHJvcGVydHkoZSwgciwgdCkge1xuXHRyZXR1cm4gKHIgPSB0b1Byb3BlcnR5S2V5KHIpKSBpbiBlID8gT2JqZWN0LmRlZmluZVByb3BlcnR5KGUsIHIsIHtcblx0XHR2YWx1ZTogdCxcblx0XHRlbnVtZXJhYmxlOiAhMCxcblx0XHRjb25maWd1cmFibGU6ICEwLFxuXHRcdHdyaXRhYmxlOiAhMFxuXHR9KSA6IGVbcl0gPSB0LCBlO1xufVxuLy8jZW5kcmVnaW9uXG4vLyNyZWdpb24gc3JjL3NoYXJlZC9obXIudHNcbnZhciBITVJDb250ZXh0ID0gY2xhc3Mge1xuXHRjb25zdHJ1Y3RvcihobXJDbGllbnQsIG93bmVyUGF0aCkge1xuXHRcdHRoaXMuaG1yQ2xpZW50ID0gaG1yQ2xpZW50O1xuXHRcdHRoaXMub3duZXJQYXRoID0gb3duZXJQYXRoO1xuXHRcdF9kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcIm5ld0xpc3RlbmVyc1wiLCB2b2lkIDApO1xuXHRcdGlmICghaG1yQ2xpZW50LmRhdGFNYXAuaGFzKG93bmVyUGF0aCkpIGhtckNsaWVudC5kYXRhTWFwLnNldChvd25lclBhdGgsIHt9KTtcblx0XHRjb25zdCBtb2QgPSBobXJDbGllbnQuaG90TW9kdWxlc01hcC5nZXQob3duZXJQYXRoKTtcblx0XHRpZiAobW9kKSBtb2QuY2FsbGJhY2tzID0gW107XG5cdFx0Y29uc3Qgc3RhbGVMaXN0ZW5lcnMgPSBobXJDbGllbnQuY3R4VG9MaXN0ZW5lcnNNYXAuZ2V0KG93bmVyUGF0aCk7XG5cdFx0aWYgKHN0YWxlTGlzdGVuZXJzKSBmb3IgKGNvbnN0IFtldmVudCwgc3RhbGVGbnNdIG9mIHN0YWxlTGlzdGVuZXJzKSB7XG5cdFx0XHRjb25zdCBsaXN0ZW5lcnMgPSBobXJDbGllbnQuY3VzdG9tTGlzdGVuZXJzTWFwLmdldChldmVudCk7XG5cdFx0XHRpZiAobGlzdGVuZXJzKSBobXJDbGllbnQuY3VzdG9tTGlzdGVuZXJzTWFwLnNldChldmVudCwgbGlzdGVuZXJzLmZpbHRlcigobCkgPT4gIXN0YWxlRm5zLmluY2x1ZGVzKGwpKSk7XG5cdFx0fVxuXHRcdHRoaXMubmV3TGlzdGVuZXJzID0gLyogQF9fUFVSRV9fICovIG5ldyBNYXAoKTtcblx0XHRobXJDbGllbnQuY3R4VG9MaXN0ZW5lcnNNYXAuc2V0KG93bmVyUGF0aCwgdGhpcy5uZXdMaXN0ZW5lcnMpO1xuXHR9XG5cdGdldCBkYXRhKCkge1xuXHRcdHJldHVybiB0aGlzLmhtckNsaWVudC5kYXRhTWFwLmdldCh0aGlzLm93bmVyUGF0aCk7XG5cdH1cblx0YWNjZXB0KGRlcHMsIGNhbGxiYWNrKSB7XG5cdFx0aWYgKHR5cGVvZiBkZXBzID09PSBcImZ1bmN0aW9uXCIgfHwgIWRlcHMpIHRoaXMuYWNjZXB0RGVwcyhbdGhpcy5vd25lclBhdGhdLCAoW21vZF0pID0+IGRlcHM/Lihtb2QpKTtcblx0XHRlbHNlIGlmICh0eXBlb2YgZGVwcyA9PT0gXCJzdHJpbmdcIikgdGhpcy5hY2NlcHREZXBzKFtkZXBzXSwgKFttb2RdKSA9PiBjYWxsYmFjaz8uKG1vZCkpO1xuXHRcdGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGVwcykpIHRoaXMuYWNjZXB0RGVwcyhkZXBzLCBjYWxsYmFjayk7XG5cdFx0ZWxzZSB0aHJvdyBuZXcgRXJyb3IoYGludmFsaWQgaG90LmFjY2VwdCgpIHVzYWdlLmApO1xuXHR9XG5cdGFjY2VwdEV4cG9ydHMoZXhwb3J0TmFtZXMsIGNhbGxiYWNrKSB7XG5cdFx0dGhpcy5hY2NlcHREZXBzKFt0aGlzLm93bmVyUGF0aF0sIChbbW9kXSkgPT4gY2FsbGJhY2s/Lihtb2QpLCB0eXBlb2YgZXhwb3J0TmFtZXMgPT09IFwic3RyaW5nXCIgPyBbZXhwb3J0TmFtZXNdIDogZXhwb3J0TmFtZXMpO1xuXHR9XG5cdGRpc3Bvc2UoY2IpIHtcblx0XHR0aGlzLmhtckNsaWVudC5kaXNwb3NlTWFwLnNldCh0aGlzLm93bmVyUGF0aCwgY2IpO1xuXHR9XG5cdHBydW5lKGNiKSB7XG5cdFx0dGhpcy5obXJDbGllbnQucHJ1bmVNYXAuc2V0KHRoaXMub3duZXJQYXRoLCBjYik7XG5cdH1cblx0ZGVjbGluZSgpIHt9XG5cdGludmFsaWRhdGUobWVzc2FnZSkge1xuXHRcdGNvbnN0IGZpcnN0SW52YWxpZGF0ZWRCeSA9IHRoaXMuaG1yQ2xpZW50LmN1cnJlbnRGaXJzdEludmFsaWRhdGVkQnkgPz8gdGhpcy5vd25lclBhdGg7XG5cdFx0dGhpcy5obXJDbGllbnQubm90aWZ5TGlzdGVuZXJzKFwidml0ZTppbnZhbGlkYXRlXCIsIHtcblx0XHRcdHBhdGg6IHRoaXMub3duZXJQYXRoLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGZpcnN0SW52YWxpZGF0ZWRCeVxuXHRcdH0pO1xuXHRcdHRoaXMuc2VuZChcInZpdGU6aW52YWxpZGF0ZVwiLCB7XG5cdFx0XHRwYXRoOiB0aGlzLm93bmVyUGF0aCxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRmaXJzdEludmFsaWRhdGVkQnlcblx0XHR9KTtcblx0XHR0aGlzLmhtckNsaWVudC5sb2dnZXIuZGVidWcoYGludmFsaWRhdGUgJHt0aGlzLm93bmVyUGF0aH0ke21lc3NhZ2UgPyBgOiAke21lc3NhZ2V9YCA6IFwiXCJ9YCk7XG5cdH1cblx0b24oZXZlbnQsIGNiKSB7XG5cdFx0Y29uc3QgYWRkVG9NYXAgPSAobWFwKSA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IG1hcC5nZXQoZXZlbnQpIHx8IFtdO1xuXHRcdFx0ZXhpc3RpbmcucHVzaChjYik7XG5cdFx0XHRtYXAuc2V0KGV2ZW50LCBleGlzdGluZyk7XG5cdFx0fTtcblx0XHRhZGRUb01hcCh0aGlzLmhtckNsaWVudC5jdXN0b21MaXN0ZW5lcnNNYXApO1xuXHRcdGFkZFRvTWFwKHRoaXMubmV3TGlzdGVuZXJzKTtcblx0fVxuXHRvZmYoZXZlbnQsIGNiKSB7XG5cdFx0Y29uc3QgcmVtb3ZlRnJvbU1hcCA9IChtYXApID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gbWFwLmdldChldmVudCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcgPT09IHZvaWQgMCkgcmV0dXJuO1xuXHRcdFx0Y29uc3QgcHJ1bmVkID0gZXhpc3RpbmcuZmlsdGVyKChsKSA9PiBsICE9PSBjYik7XG5cdFx0XHRpZiAocHJ1bmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRtYXAuZGVsZXRlKGV2ZW50KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bWFwLnNldChldmVudCwgcHJ1bmVkKTtcblx0XHR9O1xuXHRcdHJlbW92ZUZyb21NYXAodGhpcy5obXJDbGllbnQuY3VzdG9tTGlzdGVuZXJzTWFwKTtcblx0XHRyZW1vdmVGcm9tTWFwKHRoaXMubmV3TGlzdGVuZXJzKTtcblx0fVxuXHRzZW5kKGV2ZW50LCBkYXRhKSB7XG5cdFx0dGhpcy5obXJDbGllbnQuc2VuZCh7XG5cdFx0XHR0eXBlOiBcImN1c3RvbVwiLFxuXHRcdFx0ZXZlbnQsXG5cdFx0XHRkYXRhXG5cdFx0fSk7XG5cdH1cblx0YWNjZXB0RGVwcyhkZXBzLCBjYWxsYmFjayA9ICgpID0+IHt9LCBleHBvcnRzKSB7XG5cdFx0Y29uc3QgbW9kID0gdGhpcy5obXJDbGllbnQuaG90TW9kdWxlc01hcC5nZXQodGhpcy5vd25lclBhdGgpIHx8IHtcblx0XHRcdGlkOiB0aGlzLm93bmVyUGF0aCxcblx0XHRcdGNhbGxiYWNrczogW11cblx0XHR9O1xuXHRcdG1vZC5jYWxsYmFja3MucHVzaCh7XG5cdFx0XHRkZXBzLFxuXHRcdFx0Zm46IGNhbGxiYWNrLFxuXHRcdFx0ZXhwb3J0c1xuXHRcdH0pO1xuXHRcdHRoaXMuaG1yQ2xpZW50LmhvdE1vZHVsZXNNYXAuc2V0KHRoaXMub3duZXJQYXRoLCBtb2QpO1xuXHR9XG59O1xudmFyIEhNUkNsaWVudCA9IGNsYXNzIHtcblx0Y29uc3RydWN0b3IobG9nZ2VyLCB0cmFuc3BvcnQsIGltcG9ydFVwZGF0ZWRNb2R1bGUpIHtcblx0XHR0aGlzLmxvZ2dlciA9IGxvZ2dlcjtcblx0XHR0aGlzLnRyYW5zcG9ydCA9IHRyYW5zcG9ydDtcblx0XHR0aGlzLmltcG9ydFVwZGF0ZWRNb2R1bGUgPSBpbXBvcnRVcGRhdGVkTW9kdWxlO1xuXHRcdF9kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcImhvdE1vZHVsZXNNYXBcIiwgLyogQF9fUFVSRV9fICovIG5ldyBNYXAoKSk7XG5cdFx0X2RlZmluZVByb3BlcnR5KHRoaXMsIFwiZGlzcG9zZU1hcFwiLCAvKiBAX19QVVJFX18gKi8gbmV3IE1hcCgpKTtcblx0XHRfZGVmaW5lUHJvcGVydHkodGhpcywgXCJwcnVuZU1hcFwiLCAvKiBAX19QVVJFX18gKi8gbmV3IE1hcCgpKTtcblx0XHRfZGVmaW5lUHJvcGVydHkodGhpcywgXCJkYXRhTWFwXCIsIC8qIEBfX1BVUkVfXyAqLyBuZXcgTWFwKCkpO1xuXHRcdF9kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcImN1c3RvbUxpc3RlbmVyc01hcFwiLCAvKiBAX19QVVJFX18gKi8gbmV3IE1hcCgpKTtcblx0XHRfZGVmaW5lUHJvcGVydHkodGhpcywgXCJjdHhUb0xpc3RlbmVyc01hcFwiLCAvKiBAX19QVVJFX18gKi8gbmV3IE1hcCgpKTtcblx0XHRfZGVmaW5lUHJvcGVydHkodGhpcywgXCJjdXJyZW50Rmlyc3RJbnZhbGlkYXRlZEJ5XCIsIHZvaWQgMCk7XG5cdFx0X2RlZmluZVByb3BlcnR5KHRoaXMsIFwidXBkYXRlUXVldWVcIiwgW10pO1xuXHRcdF9kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcInBlbmRpbmdVcGRhdGVRdWV1ZVwiLCBmYWxzZSk7XG5cdH1cblx0YXN5bmMgbm90aWZ5TGlzdGVuZXJzKGV2ZW50LCBkYXRhKSB7XG5cdFx0Y29uc3QgY2JzID0gdGhpcy5jdXN0b21MaXN0ZW5lcnNNYXAuZ2V0KGV2ZW50KTtcblx0XHRpZiAoY2JzKSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoY2JzLm1hcCgoY2IpID0+IGNiKGRhdGEpKSk7XG5cdH1cblx0c2VuZChwYXlsb2FkKSB7XG5cdFx0dGhpcy50cmFuc3BvcnQuc2VuZChwYXlsb2FkKS5jYXRjaCgoZXJyKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihlcnIpO1xuXHRcdH0pO1xuXHR9XG5cdGNsZWFyKCkge1xuXHRcdHRoaXMuaG90TW9kdWxlc01hcC5jbGVhcigpO1xuXHRcdHRoaXMuZGlzcG9zZU1hcC5jbGVhcigpO1xuXHRcdHRoaXMucHJ1bmVNYXAuY2xlYXIoKTtcblx0XHR0aGlzLmRhdGFNYXAuY2xlYXIoKTtcblx0XHR0aGlzLmN1c3RvbUxpc3RlbmVyc01hcC5jbGVhcigpO1xuXHRcdHRoaXMuY3R4VG9MaXN0ZW5lcnNNYXAuY2xlYXIoKTtcblx0fVxuXHRhc3luYyBwcnVuZVBhdGhzKHBhdGhzKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHBhdGhzLm1hcCgocGF0aCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NlciA9IHRoaXMuZGlzcG9zZU1hcC5nZXQocGF0aCk7XG5cdFx0XHRcdGlmIChkaXNwb3NlcikgcmV0dXJuIGRpc3Bvc2VyKHRoaXMuZGF0YU1hcC5nZXQocGF0aCkpO1xuXHRcdFx0fSkpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocGF0aHMubWFwKChwYXRoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZuID0gdGhpcy5wcnVuZU1hcC5nZXQocGF0aCk7XG5cdFx0XHRcdGlmIChmbikgcmV0dXJuIGZuKHRoaXMuZGF0YU1hcC5nZXQocGF0aCkpO1xuXHRcdFx0fSkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwYXRocy5mb3JFYWNoKChwYXRoKSA9PiB0aGlzLmRhdGFNYXAuZGVsZXRlKHBhdGgpKTtcblx0XHR9XG5cdH1cblx0d2FybkZhaWxlZFVwZGF0ZShlcnIsIHBhdGgpIHtcblx0XHRpZiAoIShlcnIgaW5zdGFuY2VvZiBFcnJvcikgfHwgIWVyci5tZXNzYWdlLmluY2x1ZGVzKFwiZmV0Y2hcIikpIHRoaXMubG9nZ2VyLmVycm9yKGVycik7XG5cdFx0dGhpcy5sb2dnZXIuZXJyb3IoYEZhaWxlZCB0byByZWxvYWQgJHtwYXRofS4gVGhpcyBjb3VsZCBiZSBkdWUgdG8gc3ludGF4IGVycm9ycyBvciBpbXBvcnRpbmcgbm9uLWV4aXN0ZW50IG1vZHVsZXMuIChzZWUgZXJyb3JzIGFib3ZlKWApO1xuXHR9XG5cdC8qKlxuXHQqIGJ1ZmZlciBtdWx0aXBsZSBob3QgdXBkYXRlcyB0cmlnZ2VyZWQgYnkgdGhlIHNhbWUgc3JjIGNoYW5nZVxuXHQqIHNvIHRoYXQgdGhleSBhcmUgaW52b2tlZCBpbiB0aGUgc2FtZSBvcmRlciB0aGV5IHdlcmUgc2VudC5cblx0KiAob3RoZXJ3aXNlIHRoZSBvcmRlciBtYXkgYmUgaW5jb25zaXN0ZW50IGJlY2F1c2Ugb2YgdGhlIGh0dHAgcmVxdWVzdCByb3VuZCB0cmlwKVxuXHQqL1xuXHRhc3luYyBxdWV1ZVVwZGF0ZShwYXlsb2FkKSB7XG5cdFx0dGhpcy51cGRhdGVRdWV1ZS5wdXNoKHRoaXMuZmV0Y2hVcGRhdGUocGF5bG9hZCkpO1xuXHRcdGlmICghdGhpcy5wZW5kaW5nVXBkYXRlUXVldWUpIHtcblx0XHRcdHRoaXMucGVuZGluZ1VwZGF0ZVF1ZXVlID0gdHJ1ZTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0dGhpcy5wZW5kaW5nVXBkYXRlUXVldWUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGxvYWRpbmcgPSBbLi4udGhpcy51cGRhdGVRdWV1ZV07XG5cdFx0XHR0aGlzLnVwZGF0ZVF1ZXVlID0gW107XG5cdFx0XHQoYXdhaXQgUHJvbWlzZS5hbGwobG9hZGluZykpLmZvckVhY2goKGZuKSA9PiBmbiAmJiBmbigpKTtcblx0XHR9XG5cdH1cblx0YXN5bmMgZmV0Y2hVcGRhdGUodXBkYXRlKSB7XG5cdFx0Y29uc3QgeyBwYXRoLCBhY2NlcHRlZFBhdGgsIGZpcnN0SW52YWxpZGF0ZWRCeSB9ID0gdXBkYXRlO1xuXHRcdGNvbnN0IG1vZCA9IHRoaXMuaG90TW9kdWxlc01hcC5nZXQocGF0aCk7XG5cdFx0aWYgKCFtb2QpIHJldHVybjtcblx0XHRsZXQgZmV0Y2hlZE1vZHVsZTtcblx0XHRjb25zdCBpc1NlbGZVcGRhdGUgPSBwYXRoID09PSBhY2NlcHRlZFBhdGg7XG5cdFx0Y29uc3QgcXVhbGlmaWVkQ2FsbGJhY2tzID0gbW9kLmNhbGxiYWNrcy5maWx0ZXIoKHsgZGVwcyB9KSA9PiBkZXBzLmluY2x1ZGVzKGFjY2VwdGVkUGF0aCkpO1xuXHRcdGlmIChpc1NlbGZVcGRhdGUgfHwgcXVhbGlmaWVkQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2VyID0gdGhpcy5kaXNwb3NlTWFwLmdldChhY2NlcHRlZFBhdGgpO1xuXHRcdFx0aWYgKGRpc3Bvc2VyKSBhd2FpdCBkaXNwb3Nlcih0aGlzLmRhdGFNYXAuZ2V0KGFjY2VwdGVkUGF0aCkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZmV0Y2hlZE1vZHVsZSA9IGF3YWl0IHRoaXMuaW1wb3J0VXBkYXRlZE1vZHVsZSh1cGRhdGUpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLndhcm5GYWlsZWRVcGRhdGUoZSwgYWNjZXB0ZWRQYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuY3VycmVudEZpcnN0SW52YWxpZGF0ZWRCeSA9IGZpcnN0SW52YWxpZGF0ZWRCeTtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGRlcHMsIGZuIH0gb2YgcXVhbGlmaWVkQ2FsbGJhY2tzKSBmbihkZXBzLm1hcCgoZGVwKSA9PiBkZXAgPT09IGFjY2VwdGVkUGF0aCA/IGZldGNoZWRNb2R1bGUgOiB2b2lkIDApKTtcblx0XHRcdFx0Y29uc3QgbG9nZ2VkUGF0aCA9IGlzU2VsZlVwZGF0ZSA/IHBhdGggOiBgJHthY2NlcHRlZFBhdGh9IHZpYSAke3BhdGh9YDtcblx0XHRcdFx0dGhpcy5sb2dnZXIuZGVidWcoYGhvdCB1cGRhdGVkOiAke2xvZ2dlZFBhdGh9YCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRGaXJzdEludmFsaWRhdGVkQnkgPSB2b2lkIDA7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufTtcbi8vI2VuZHJlZ2lvblxuLy8jcmVnaW9uIHNyYy9zaGFyZWQvaG1ySGFuZGxlci50c1xuZnVuY3Rpb24gY3JlYXRlSE1SSGFuZGxlcihoYW5kbGVyKSB7XG5cdGNvbnN0IHF1ZXVlID0gbmV3IFF1ZXVlKCk7XG5cdHJldHVybiAocGF5bG9hZCkgPT4gcXVldWUuZW5xdWV1ZSgoKSA9PiBoYW5kbGVyKHBheWxvYWQpKTtcbn1cbnZhciBRdWV1ZSA9IGNsYXNzIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0X2RlZmluZVByb3BlcnR5KHRoaXMsIFwicXVldWVcIiwgW10pO1xuXHRcdF9kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcInBlbmRpbmdcIiwgZmFsc2UpO1xuXHR9XG5cdGVucXVldWUocHJvbWlzZSkge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLnF1ZXVlLnB1c2goe1xuXHRcdFx0XHRwcm9taXNlLFxuXHRcdFx0XHRyZXNvbHZlLFxuXHRcdFx0XHRyZWplY3Rcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5kZXF1ZXVlKCk7XG5cdFx0fSk7XG5cdH1cblx0ZGVxdWV1ZSgpIHtcblx0XHRpZiAodGhpcy5wZW5kaW5nKSByZXR1cm4gZmFsc2U7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMucXVldWUuc2hpZnQoKTtcblx0XHRpZiAoIWl0ZW0pIHJldHVybiBmYWxzZTtcblx0XHR0aGlzLnBlbmRpbmcgPSB0cnVlO1xuXHRcdGl0ZW0ucHJvbWlzZSgpLnRoZW4oaXRlbS5yZXNvbHZlKS5jYXRjaChpdGVtLnJlamVjdCkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLnBlbmRpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuZGVxdWV1ZSgpO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59O1xuLy8jZW5kcmVnaW9uXG4vLyNyZWdpb24gc3JjL2NsaWVudC9vdmVybGF5LnRzXG5jb25zdCBobXJDb25maWdOYW1lID0gXCJ2aXRlLmNvbmZpZy5qc1wiO1xuY29uc3QgYmFzZSQxID0gXCIvXCIgfHwgXCIvXCI7XG5jb25zdCBjc3BOb25jZSA9IFwiZG9jdW1lbnRcIiBpbiBnbG9iYWxUaGlzID8gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIm1ldGFbcHJvcGVydHk9Y3NwLW5vbmNlXVwiKT8ubm9uY2UgOiB2b2lkIDA7XG5mdW5jdGlvbiBoKGUsIGF0dHJzID0ge30sIC4uLmNoaWxkcmVuKSB7XG5cdGNvbnN0IGVsZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KGUpO1xuXHRmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhhdHRycykpIGlmICh2ICE9PSB2b2lkIDApIGVsZW0uc2V0QXR0cmlidXRlKGssIHYpO1xuXHRlbGVtLmFwcGVuZCguLi5jaGlsZHJlbik7XG5cdHJldHVybiBlbGVtO1xufVxuY29uc3QgdGVtcGxhdGVTdHlsZSA9IGBcbjpob3N0IHtcbiAgcG9zaXRpb246IGZpeGVkO1xuICB0b3A6IDA7XG4gIGxlZnQ6IDA7XG4gIHdpZHRoOiAxMDAlO1xuICBoZWlnaHQ6IDEwMCU7XG4gIHotaW5kZXg6IDk5OTk5O1xuICAtLW1vbm9zcGFjZTogJ1NGTW9uby1SZWd1bGFyJywgQ29uc29sYXMsXG4gICdMaWJlcmF0aW9uIE1vbm8nLCBNZW5sbywgQ291cmllciwgbW9ub3NwYWNlO1xuICAtLXJlZDogI2ZmNTU1NTtcbiAgLS15ZWxsb3c6ICNlMmFhNTM7XG4gIC0tcHVycGxlOiAjY2ZhNGZmO1xuICAtLWN5YW46ICMyZGQ5ZGE7XG4gIC0tZGltOiAjYzljOWM5O1xuXG4gIC0td2luZG93LWJhY2tncm91bmQ6ICMxODE4MTg7XG4gIC0td2luZG93LWNvbG9yOiAjZDhkOGQ4O1xufVxuXG4uYmFja2Ryb3Age1xuICBwb3NpdGlvbjogZml4ZWQ7XG4gIHotaW5kZXg6IDk5OTk5O1xuICB0b3A6IDA7XG4gIGxlZnQ6IDA7XG4gIHdpZHRoOiAxMDAlO1xuICBoZWlnaHQ6IDEwMCU7XG4gIG92ZXJmbG93LXk6IHNjcm9sbDtcbiAgbWFyZ2luOiAwO1xuICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuNjYpO1xufVxuXG4ud2luZG93IHtcbiAgZm9udC1mYW1pbHk6IHZhcigtLW1vbm9zcGFjZSk7XG4gIGxpbmUtaGVpZ2h0OiAxLjU7XG4gIG1heC13aWR0aDogODB2dztcbiAgY29sb3I6IHZhcigtLXdpbmRvdy1jb2xvcik7XG4gIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG4gIG1hcmdpbjogMzBweCBhdXRvO1xuICBwYWRkaW5nOiAyLjV2aCA0dnc7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgYmFja2dyb3VuZDogdmFyKC0td2luZG93LWJhY2tncm91bmQpO1xuICBib3JkZXItcmFkaXVzOiA2cHggNnB4IDhweCA4cHg7XG4gIGJveC1zaGFkb3c6IDAgMTlweCAzOHB4IHJnYmEoMCwwLDAsMC4zMCksIDAgMTVweCAxMnB4IHJnYmEoMCwwLDAsMC4yMik7XG4gIG92ZXJmbG93OiBoaWRkZW47XG4gIGJvcmRlci10b3A6IDhweCBzb2xpZCB2YXIoLS1yZWQpO1xuICBkaXJlY3Rpb246IGx0cjtcbiAgdGV4dC1hbGlnbjogbGVmdDtcbn1cblxucHJlIHtcbiAgZm9udC1mYW1pbHk6IHZhcigtLW1vbm9zcGFjZSk7XG4gIGZvbnQtc2l6ZTogMTZweDtcbiAgbWFyZ2luLXRvcDogMDtcbiAgbWFyZ2luLWJvdHRvbTogMWVtO1xuICBvdmVyZmxvdy14OiBzY3JvbGw7XG4gIHNjcm9sbGJhci13aWR0aDogbm9uZTtcbn1cblxucHJlOjotd2Via2l0LXNjcm9sbGJhciB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbnByZS5mcmFtZTo6LXdlYmtpdC1zY3JvbGxiYXIge1xuICBkaXNwbGF5OiBibG9jaztcbiAgaGVpZ2h0OiA1cHg7XG59XG5cbnByZS5mcmFtZTo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIge1xuICBiYWNrZ3JvdW5kOiAjOTk5O1xuICBib3JkZXItcmFkaXVzOiA1cHg7XG59XG5cbnByZS5mcmFtZSB7XG4gIHNjcm9sbGJhci13aWR0aDogdGhpbjtcbn1cblxuLm1lc3NhZ2Uge1xuICBsaW5lLWhlaWdodDogMS4zO1xuICBmb250LXdlaWdodDogNDAwO1xuICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG59XG5cbi5tZXNzYWdlLWJvZHkge1xuICBjb2xvcjogdmFyKC0tcmVkKTtcbn1cblxuLnBsdWdpbiB7XG4gIGNvbG9yOiB2YXIoLS1wdXJwbGUpO1xufVxuXG4uZmlsZSB7XG4gIGNvbG9yOiB2YXIoLS1jeWFuKTtcbiAgbWFyZ2luLWJvdHRvbTogMDtcbiAgd2hpdGUtc3BhY2U6IHByZS13cmFwO1xuICB3b3JkLWJyZWFrOiBicmVhay1hbGw7XG59XG5cbi5mcmFtZSB7XG4gIGNvbG9yOiB2YXIoLS15ZWxsb3cpO1xufVxuXG4uc3RhY2sge1xuICBmb250LXNpemU6IDEzcHg7XG4gIGNvbG9yOiB2YXIoLS1kaW0pO1xufVxuXG4udGlwIHtcbiAgZm9udC1zaXplOiAxM3B4O1xuICBjb2xvcjogIzk5OTtcbiAgYm9yZGVyLXRvcDogMXB4IGRvdHRlZCAjOTk5O1xuICBwYWRkaW5nLXRvcDogMTNweDtcbiAgbGluZS1oZWlnaHQ6IDEuODtcbn1cblxuY29kZSB7XG4gIGZvbnQtc2l6ZTogMTNweDtcbiAgZm9udC1mYW1pbHk6IHZhcigtLW1vbm9zcGFjZSk7XG4gIGNvbG9yOiB2YXIoLS15ZWxsb3cpO1xufVxuXG4uZmlsZS1saW5rIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG4gIGN1cnNvcjogcG9pbnRlcjtcbn1cblxua2JkIHtcbiAgbGluZS1oZWlnaHQ6IDEuNTtcbiAgZm9udC1mYW1pbHk6IHVpLW1vbm9zcGFjZSwgTWVubG8sIE1vbmFjbywgQ29uc29sYXMsIFwiTGliZXJhdGlvbiBNb25vXCIsIFwiQ291cmllciBOZXdcIiwgbW9ub3NwYWNlO1xuICBmb250LXNpemU6IDAuNzVyZW07XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGJhY2tncm91bmQtY29sb3I6IHJnYigzOCwgNDAsIDQ0KTtcbiAgY29sb3I6IHJnYigxNjYsIDE2NywgMTcxKTtcbiAgcGFkZGluZzogMC4xNXJlbSAwLjNyZW07XG4gIGJvcmRlci1yYWRpdXM6IDAuMjVyZW07XG4gIGJvcmRlci13aWR0aDogMC4wNjI1cmVtIDAuMDYyNXJlbSAwLjE4NzVyZW07XG4gIGJvcmRlci1zdHlsZTogc29saWQ7XG4gIGJvcmRlci1jb2xvcjogcmdiKDU0LCA1NywgNjQpO1xuICBib3JkZXItaW1hZ2U6IGluaXRpYWw7XG59XG5gO1xuY29uc3QgY3JlYXRlVGVtcGxhdGUgPSAoKSA9PiBoKFwiZGl2XCIsIHtcblx0Y2xhc3M6IFwiYmFja2Ryb3BcIixcblx0cGFydDogXCJiYWNrZHJvcFwiXG59LCBoKFwiZGl2XCIsIHtcblx0Y2xhc3M6IFwid2luZG93XCIsXG5cdHBhcnQ6IFwid2luZG93XCJcbn0sIGgoXCJwcmVcIiwge1xuXHRjbGFzczogXCJtZXNzYWdlXCIsXG5cdHBhcnQ6IFwibWVzc2FnZVwiXG59LCBoKFwic3BhblwiLCB7XG5cdGNsYXNzOiBcInBsdWdpblwiLFxuXHRwYXJ0OiBcInBsdWdpblwiXG59KSwgaChcInNwYW5cIiwge1xuXHRjbGFzczogXCJtZXNzYWdlLWJvZHlcIixcblx0cGFydDogXCJtZXNzYWdlLWJvZHlcIlxufSkpLCBoKFwicHJlXCIsIHtcblx0Y2xhc3M6IFwiZmlsZVwiLFxuXHRwYXJ0OiBcImZpbGVcIlxufSksIGgoXCJwcmVcIiwge1xuXHRjbGFzczogXCJmcmFtZVwiLFxuXHRwYXJ0OiBcImZyYW1lXCJcbn0pLCBoKFwicHJlXCIsIHtcblx0Y2xhc3M6IFwic3RhY2tcIixcblx0cGFydDogXCJzdGFja1wiXG59KSwgaChcImRpdlwiLCB7XG5cdGNsYXNzOiBcInRpcFwiLFxuXHRwYXJ0OiBcInRpcFwiXG59LCBcIkNsaWNrIG91dHNpZGUsIHByZXNzIFwiLCBoKFwia2JkXCIsIHt9LCBcIkVzY1wiKSwgXCIga2V5LCBvciBmaXggdGhlIGNvZGUgdG8gZGlzbWlzcy5cIiwgaChcImJyXCIpLCBcIllvdSBjYW4gYWxzbyBkaXNhYmxlIHRoaXMgb3ZlcmxheSBieSBzZXR0aW5nIFwiLCBoKFwiY29kZVwiLCB7IHBhcnQ6IFwiY29uZmlnLW9wdGlvbi1uYW1lXCIgfSwgXCJzZXJ2ZXIuaG1yLm92ZXJsYXlcIiksIFwiIHRvIFwiLCBoKFwiY29kZVwiLCB7IHBhcnQ6IFwiY29uZmlnLW9wdGlvbi12YWx1ZVwiIH0sIFwiZmFsc2VcIiksIFwiIGluIFwiLCBoKFwiY29kZVwiLCB7IHBhcnQ6IFwiY29uZmlnLWZpbGUtbmFtZVwiIH0sIGhtckNvbmZpZ05hbWUpLCBcIi5cIikpLCBoKFwic3R5bGVcIiwgeyBub25jZTogY3NwTm9uY2UgfSwgdGVtcGxhdGVTdHlsZSkpO1xuY29uc3QgZmlsZVJFID0gLyg/OmZpbGU6XFwvXFwvKT8oPzpbYS16QS1aXTpcXFxcfFxcLykuKj86XFxkKzpcXGQrL2c7XG5jb25zdCBjb2RlZnJhbWVSRSA9IC9eKD86Pj9cXHMqXFxkK1xccytcXHwuKnxcXHMrXFx8XFxzKlxcXi4qKVxccj9cXG4vZ207XG5jb25zdCB7IEhUTUxFbGVtZW50ID0gY2xhc3Mge30gfSA9IGdsb2JhbFRoaXM7XG52YXIgRXJyb3JPdmVybGF5ID0gY2xhc3MgZXh0ZW5kcyBIVE1MRWxlbWVudCB7XG5cdGNvbnN0cnVjdG9yKGVyciwgbGlua3MgPSB0cnVlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJvb3QgPSB0aGlzLmF0dGFjaFNoYWRvdyh7IG1vZGU6IFwib3BlblwiIH0pO1xuXHRcdHRoaXMucm9vdC5hcHBlbmRDaGlsZChjcmVhdGVUZW1wbGF0ZSgpKTtcblx0XHRjb2RlZnJhbWVSRS5sYXN0SW5kZXggPSAwO1xuXHRcdGNvbnN0IGhhc0ZyYW1lID0gZXJyLmZyYW1lICYmIGNvZGVmcmFtZVJFLnRlc3QoZXJyLmZyYW1lKTtcblx0XHRjb25zdCBtZXNzYWdlID0gaGFzRnJhbWUgPyBlcnIubWVzc2FnZS5yZXBsYWNlKGNvZGVmcmFtZVJFLCBcIlwiKSA6IGVyci5tZXNzYWdlO1xuXHRcdGlmIChlcnIucGx1Z2luKSB0aGlzLnRleHQoXCIucGx1Z2luXCIsIGBbcGx1Z2luOiR7ZXJyLnBsdWdpbn1dIGApO1xuXHRcdHRoaXMudGV4dChcIi5tZXNzYWdlLWJvZHlcIiwgbWVzc2FnZS50cmltKCkpO1xuXHRcdGNvbnN0IFtmaWxlXSA9IChlcnIubG9jPy5maWxlIHx8IGVyci5pZCB8fCBcInVua25vd24gZmlsZVwiKS5zcGxpdChgP2ApO1xuXHRcdGlmIChlcnIubG9jKSB0aGlzLnRleHQoXCIuZmlsZVwiLCBgJHtmaWxlfToke2Vyci5sb2MubGluZX06JHtlcnIubG9jLmNvbHVtbn1gLCBsaW5rcyk7XG5cdFx0ZWxzZSBpZiAoZXJyLmlkKSB0aGlzLnRleHQoXCIuZmlsZVwiLCBmaWxlKTtcblx0XHRpZiAoaGFzRnJhbWUpIHRoaXMudGV4dChcIi5mcmFtZVwiLCBlcnIuZnJhbWUudHJpbSgpKTtcblx0XHR0aGlzLnRleHQoXCIuc3RhY2tcIiwgZXJyLnN0YWNrLCBsaW5rcyk7XG5cdFx0dGhpcy5yb290LnF1ZXJ5U2VsZWN0b3IoXCIud2luZG93XCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KTtcblx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5jbG9zZU9uRXNjID0gKGUpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gXCJFc2NhcGVcIiB8fCBlLmNvZGUgPT09IFwiRXNjYXBlXCIpIHRoaXMuY2xvc2UoKTtcblx0XHR9O1xuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIHRoaXMuY2xvc2VPbkVzYyk7XG5cdH1cblx0dGV4dChzZWxlY3RvciwgdGV4dCwgbGlua0ZpbGVzID0gZmFsc2UpIHtcblx0XHRjb25zdCBlbCA9IHRoaXMucm9vdC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0XHRpZiAoIWxpbmtGaWxlcykgZWwudGV4dENvbnRlbnQgPSB0ZXh0O1xuXHRcdGVsc2Uge1xuXHRcdFx0bGV0IGN1ckluZGV4ID0gMDtcblx0XHRcdGxldCBtYXRjaDtcblx0XHRcdGZpbGVSRS5sYXN0SW5kZXggPSAwO1xuXHRcdFx0d2hpbGUgKG1hdGNoID0gZmlsZVJFLmV4ZWModGV4dCkpIHtcblx0XHRcdFx0Y29uc3QgeyAwOiBmaWxlLCBpbmRleCB9ID0gbWF0Y2g7XG5cdFx0XHRcdGNvbnN0IGZyYWcgPSB0ZXh0LnNsaWNlKGN1ckluZGV4LCBpbmRleCk7XG5cdFx0XHRcdGVsLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGZyYWcpKTtcblx0XHRcdFx0Y29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xuXHRcdFx0XHRsaW5rLnRleHRDb250ZW50ID0gZmlsZTtcblx0XHRcdFx0bGluay5jbGFzc05hbWUgPSBcImZpbGUtbGlua1wiO1xuXHRcdFx0XHRsaW5rLm9uY2xpY2sgPSAoKSA9PiB7XG5cdFx0XHRcdFx0ZmV0Y2gobmV3IFVSTChgJHtiYXNlJDF9X19vcGVuLWluLWVkaXRvcj9maWxlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGZpbGUpfWAsIGltcG9ydC5tZXRhLnVybCkpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRlbC5hcHBlbmRDaGlsZChsaW5rKTtcblx0XHRcdFx0Y3VySW5kZXggKz0gZnJhZy5sZW5ndGggKyBmaWxlLmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJJbmRleCA8IHRleHQubGVuZ3RoKSBlbC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0ZXh0LnNsaWNlKGN1ckluZGV4KSkpO1xuXHRcdH1cblx0fVxuXHRjbG9zZSgpIHtcblx0XHR0aGlzLnBhcmVudE5vZGU/LnJlbW92ZUNoaWxkKHRoaXMpO1xuXHRcdGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIHRoaXMuY2xvc2VPbkVzYyk7XG5cdH1cbn07XG5jb25zdCBvdmVybGF5SWQgPSBcInZpdGUtZXJyb3Itb3ZlcmxheVwiO1xuY29uc3QgeyBjdXN0b21FbGVtZW50cyB9ID0gZ2xvYmFsVGhpcztcbmlmIChjdXN0b21FbGVtZW50cyAmJiAhY3VzdG9tRWxlbWVudHMuZ2V0KFwidml0ZS1lcnJvci1vdmVybGF5XCIpKSBjdXN0b21FbGVtZW50cy5kZWZpbmUob3ZlcmxheUlkLCBFcnJvck92ZXJsYXkpO1xuLy8jZW5kcmVnaW9uXG4vLyNyZWdpb24gc3JjL2NsaWVudC9jbGllbnQudHNcbmNvbnNvbGUuZGVidWcoXCJbdml0ZV0gY29ubmVjdGluZy4uLlwiKTtcbmNvbnN0IGltcG9ydE1ldGFVcmwgPSBuZXcgVVJMKGltcG9ydC5tZXRhLnVybCk7XG5jb25zdCBzZXJ2ZXJIb3N0ID0gXCJsb2NhbGhvc3Q6NTE3My9cIjtcbmNvbnN0IHNvY2tldFByb3RvY29sID0gbnVsbCB8fCAoaW1wb3J0TWV0YVVybC5wcm90b2NvbCA9PT0gXCJodHRwczpcIiA/IFwid3NzXCIgOiBcIndzXCIpO1xuY29uc3QgaG1yUG9ydCA9IG51bGw7XG5jb25zdCBzb2NrZXRIb3N0ID0gYCR7bnVsbCB8fCBpbXBvcnRNZXRhVXJsLmhvc3RuYW1lfToke2htclBvcnQgfHwgaW1wb3J0TWV0YVVybC5wb3J0fSR7XCIvXCJ9YDtcbmNvbnN0IGRpcmVjdFNvY2tldEhvc3QgPSBcImxvY2FsaG9zdDo1MTczL1wiO1xuY29uc3QgYmFzZSA9IFwiL1wiIHx8IFwiL1wiO1xuY29uc3QgaG1yVGltZW91dCA9IDMwMDAwO1xuY29uc3Qgd3NUb2tlbiA9IFwiSHRwNWdJVHpLTEpnXCI7XG5jb25zdCBmb3J3YXJkQ29uc29sZSA9IHtcImVuYWJsZWRcIjpmYWxzZSxcInVuaGFuZGxlZEVycm9yc1wiOmZhbHNlLFwibG9nTGV2ZWxzXCI6W119O1xuY29uc3QgdHJhbnNwb3J0ID0gbm9ybWFsaXplTW9kdWxlUnVubmVyVHJhbnNwb3J0KCgoKSA9PiB7XG5cdGxldCB3c1RyYW5zcG9ydCA9IGNyZWF0ZVdlYlNvY2tldE1vZHVsZVJ1bm5lclRyYW5zcG9ydCh7XG5cdFx0Y3JlYXRlQ29ubmVjdGlvbjogKCkgPT4gbmV3IFdlYlNvY2tldChgJHtzb2NrZXRQcm90b2NvbH06Ly8ke3NvY2tldEhvc3R9P3Rva2VuPSR7d3NUb2tlbn1gLCBcInZpdGUtaG1yXCIpLFxuXHRcdHBpbmdJbnRlcnZhbDogaG1yVGltZW91dFxuXHR9KTtcblx0cmV0dXJuIHtcblx0XHRhc3luYyBjb25uZWN0KGhhbmRsZXJzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB3c1RyYW5zcG9ydC5jb25uZWN0KGhhbmRsZXJzKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKCFobXJQb3J0KSB7XG5cdFx0XHRcdFx0d3NUcmFuc3BvcnQgPSBjcmVhdGVXZWJTb2NrZXRNb2R1bGVSdW5uZXJUcmFuc3BvcnQoe1xuXHRcdFx0XHRcdFx0Y3JlYXRlQ29ubmVjdGlvbjogKCkgPT4gbmV3IFdlYlNvY2tldChgJHtzb2NrZXRQcm90b2NvbH06Ly8ke2RpcmVjdFNvY2tldEhvc3R9P3Rva2VuPSR7d3NUb2tlbn1gLCBcInZpdGUtaG1yXCIpLFxuXHRcdFx0XHRcdFx0cGluZ0ludGVydmFsOiBobXJUaW1lb3V0XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHdzVHJhbnNwb3J0LmNvbm5lY3QoaGFuZGxlcnMpO1xuXHRcdFx0XHRcdFx0Y29uc29sZS5pbmZvKFwiW3ZpdGVdIERpcmVjdCB3ZWJzb2NrZXQgY29ubmVjdGlvbiBmYWxsYmFjay4gQ2hlY2sgb3V0IGh0dHBzOi8vdml0ZS5kZXYvY29uZmlnL3NlcnZlci1vcHRpb25zLmh0bWwjc2VydmVyLWhtciB0byByZW1vdmUgdGhlIHByZXZpb3VzIGNvbm5lY3Rpb24gZXJyb3IuXCIpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IgJiYgZS5tZXNzYWdlLmluY2x1ZGVzKFwiV2ViU29ja2V0IGNsb3NlZCB3aXRob3V0IG9wZW5lZC5cIikpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudFNjcmlwdEhvc3RVUkwgPSBuZXcgVVJMKGltcG9ydC5tZXRhLnVybCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRTY3JpcHRIb3N0ID0gY3VycmVudFNjcmlwdEhvc3RVUkwuaG9zdCArIGN1cnJlbnRTY3JpcHRIb3N0VVJMLnBhdGhuYW1lLnJlcGxhY2UoL0B2aXRlXFwvY2xpZW50JC8sIFwiXCIpO1xuXHRcdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBbdml0ZV0gZmFpbGVkIHRvIGNvbm5lY3QgdG8gd2Vic29ja2V0LlxueW91ciBjdXJyZW50IHNldHVwOlxuICAoYnJvd3NlcikgJHtjdXJyZW50U2NyaXB0SG9zdH0gPC0tW0hUVFBdLS0+ICR7c2VydmVySG9zdH0gKHNlcnZlcilcXG4gIChicm93c2VyKSAke3NvY2tldEhvc3R9IDwtLVtXZWJTb2NrZXQgKGZhaWxpbmcpXS0tPiAke2RpcmVjdFNvY2tldEhvc3R9IChzZXJ2ZXIpXFxuQ2hlY2sgb3V0IHlvdXIgVml0ZSAvIG5ldHdvcmsgY29uZmlndXJhdGlvbiBhbmQgaHR0cHM6Ly92aXRlLmRldi9jb25maWcvc2VydmVyLW9wdGlvbnMuaHRtbCNzZXJ2ZXItaG1yIC5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFt2aXRlXSBmYWlsZWQgdG8gY29ubmVjdCB0byB3ZWJzb2NrZXQgKCR7ZX0pLiBgKTtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGFzeW5jIGRpc2Nvbm5lY3QoKSB7XG5cdFx0XHRhd2FpdCB3c1RyYW5zcG9ydC5kaXNjb25uZWN0KCk7XG5cdFx0fSxcblx0XHRzZW5kKGRhdGEpIHtcblx0XHRcdHdzVHJhbnNwb3J0LnNlbmQoZGF0YSk7XG5cdFx0fVxuXHR9O1xufSkoKSk7XG5sZXQgd2lsbFVubG9hZCA9IGZhbHNlO1xuaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyPy4oXCJiZWZvcmV1bmxvYWRcIiwgKCkgPT4ge1xuXHR3aWxsVW5sb2FkID0gdHJ1ZTtcbn0pO1xuZnVuY3Rpb24gY2xlYW5VcmwocGF0aG5hbWUpIHtcblx0Y29uc3QgdXJsID0gbmV3IFVSTChwYXRobmFtZSwgXCJodHRwOi8vdml0ZS5kZXZcIik7XG5cdHVybC5zZWFyY2hQYXJhbXMuZGVsZXRlKFwiZGlyZWN0XCIpO1xuXHRyZXR1cm4gdXJsLnBhdGhuYW1lICsgdXJsLnNlYXJjaDtcbn1cbmxldCBpc0ZpcnN0VXBkYXRlID0gdHJ1ZTtcbmNvbnN0IG91dGRhdGVkTGlua1RhZ3MgPSAvKiBAX19QVVJFX18gKi8gbmV3IFdlYWtTZXQoKTtcbmNvbnN0IGRlYm91bmNlUmVsb2FkID0gKHRpbWUpID0+IHtcblx0bGV0IHRpbWVyO1xuXHRyZXR1cm4gKCkgPT4ge1xuXHRcdGlmICh0aW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdHRpbWVyID0gbnVsbDtcblx0XHR9XG5cdFx0dGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGxvY2F0aW9uLnJlbG9hZCgpO1xuXHRcdH0sIHRpbWUpO1xuXHR9O1xufTtcbmNvbnN0IHBhZ2VSZWxvYWQgPSBkZWJvdW5jZVJlbG9hZCgyMCk7XG5jb25zdCBobXJDbGllbnQgPSBuZXcgSE1SQ2xpZW50KHtcblx0ZXJyb3I6IChlcnIpID0+IGNvbnNvbGUuZXJyb3IoXCJbdml0ZV1cIiwgZXJyKSxcblx0ZGVidWc6ICguLi5tc2cpID0+IGNvbnNvbGUuZGVidWcoXCJbdml0ZV1cIiwgLi4ubXNnKVxufSwgdHJhbnNwb3J0LCBhc3luYyBmdW5jdGlvbiBpbXBvcnRVcGRhdGVkTW9kdWxlKHsgYWNjZXB0ZWRQYXRoLCB0aW1lc3RhbXAsIGV4cGxpY2l0SW1wb3J0UmVxdWlyZWQsIGlzV2l0aGluQ2lyY3VsYXJJbXBvcnQgfSkge1xuXHRjb25zdCBbYWNjZXB0ZWRQYXRoV2l0aG91dFF1ZXJ5LCBxdWVyeV0gPSBhY2NlcHRlZFBhdGguc3BsaXQoYD9gKTtcblx0Y29uc3QgaW1wb3J0UHJvbWlzZSA9IGltcG9ydChcblx0XHQvKiBAdml0ZS1pZ25vcmUgKi9cblx0XHRtb2R1bGVVcmxUb0Jyb3dzZXJVcmwoYCR7YWNjZXB0ZWRQYXRoV2l0aG91dFF1ZXJ5fT8ke2V4cGxpY2l0SW1wb3J0UmVxdWlyZWQgPyBcImltcG9ydCZcIiA6IFwiXCJ9dD0ke3RpbWVzdGFtcH0ke3F1ZXJ5ID8gYCYke3F1ZXJ5fWAgOiBcIlwifWAsIGJhc2UpXG4pO1xuXHRpZiAoaXNXaXRoaW5DaXJjdWxhckltcG9ydCkgaW1wb3J0UHJvbWlzZS5jYXRjaCgoKSA9PiB7XG5cdFx0Y29uc29sZS5pbmZvKGBbaG1yXSAke2FjY2VwdGVkUGF0aH0gZmFpbGVkIHRvIGFwcGx5IEhNUiBhcyBpdCdzIHdpdGhpbiBhIGNpcmN1bGFyIGltcG9ydC4gUmVsb2FkaW5nIHBhZ2UgdG8gcmVzZXQgdGhlIGV4ZWN1dGlvbiBvcmRlci4gVG8gZGVidWcgYW5kIGJyZWFrIHRoZSBjaXJjdWxhciBpbXBvcnQsIHlvdSBjYW4gcnVuIFxcYHZpdGUgLS1kZWJ1ZyBobXJcXGAgdG8gbG9nIHRoZSBjaXJjdWxhciBkZXBlbmRlbmN5IHBhdGggaWYgYSBmaWxlIGNoYW5nZSB0cmlnZ2VyZWQgaXQuYCk7XG5cdFx0cGFnZVJlbG9hZCgpO1xuXHR9KTtcblx0cmV0dXJuIGF3YWl0IGltcG9ydFByb21pc2U7XG59KTtcbmxldCBidW5kbGVkRGV2Q2xpZW50O1xudHJhbnNwb3J0LmNvbm5lY3QoY3JlYXRlSE1SSGFuZGxlcihoYW5kbGVNZXNzYWdlKSk7XG5zZXR1cEZvcndhcmRDb25zb2xlSGFuZGxlcih0cmFuc3BvcnQsIGZvcndhcmRDb25zb2xlKTtcbmZ1bmN0aW9uIGNsZWFyT3ZlcmxheU9yUmVsb2FkT25GaXJzdFVwZGF0ZSgpIHtcblx0aWYgKGhhc0RvY3VtZW50KSB7XG5cdFx0aWYgKGlzRmlyc3RVcGRhdGUgJiYgaGFzRXJyb3JPdmVybGF5KCkpIHtcblx0XHRcdGxvY2F0aW9uLnJlbG9hZCgpO1xuXHRcdFx0cmV0dXJuIFwicmVsb2FkXCI7XG5cdFx0fVxuXHRcdGlmIChlbmFibGVPdmVybGF5KSBjbGVhckVycm9yT3ZlcmxheSgpO1xuXHRcdGlzRmlyc3RVcGRhdGUgPSBmYWxzZTtcblx0fVxuXHRyZXR1cm4gXCJjb250aW51ZVwiO1xufVxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlTWVzc2FnZShwYXlsb2FkKSB7XG5cdGNvbnN0IGFjdGl2ZUhtckNsaWVudCA9IGhtckNsaWVudDtcblx0c3dpdGNoIChwYXlsb2FkLnR5cGUpIHtcblx0XHRjYXNlIFwiY29ubmVjdGVkXCI6XG5cdFx0XHRjb25zb2xlLmRlYnVnKGBbdml0ZV0gY29ubmVjdGVkLmApO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcImJ1bmRsZWQtZGV2LXVwZGF0ZVwiOlxuXHRcdFx0YnVuZGxlZERldkNsaWVudC5oYW5kbGVQdXNoKHBheWxvYWQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcInVwZGF0ZVwiOlxuXHRcdFx0YXdhaXQgYWN0aXZlSG1yQ2xpZW50Lm5vdGlmeUxpc3RlbmVycyhcInZpdGU6YmVmb3JlVXBkYXRlXCIsIHBheWxvYWQpO1xuXHRcdFx0aWYgKGNsZWFyT3ZlcmxheU9yUmVsb2FkT25GaXJzdFVwZGF0ZSgpID09PSBcInJlbG9hZFwiKSByZXR1cm47XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwYXlsb2FkLnVwZGF0ZXMubWFwKGFzeW5jICh1cGRhdGUpID0+IHtcblx0XHRcdFx0aWYgKHVwZGF0ZS50eXBlID09PSBcImpzLXVwZGF0ZVwiKSByZXR1cm4gaG1yQ2xpZW50LnF1ZXVlVXBkYXRlKHVwZGF0ZSk7XG5cdFx0XHRcdGNvbnN0IHsgcGF0aCwgdGltZXN0YW1wIH0gPSB1cGRhdGU7XG5cdFx0XHRcdGNvbnN0IHNlYXJjaFVybCA9IGNsZWFuVXJsKHBhdGgpO1xuXHRcdFx0XHRjb25zdCBlbCA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChcImxpbmtcIikpLmZpbmQoKGUpID0+ICFvdXRkYXRlZExpbmtUYWdzLmhhcyhlKSAmJiBjbGVhblVybChlLmhyZWYpLmluY2x1ZGVzKHNlYXJjaFVybCkpO1xuXHRcdFx0XHRpZiAoIWVsKSByZXR1cm47XG5cdFx0XHRcdGNvbnN0IGJyb3dzZXJVcmwgPSBtb2R1bGVVcmxUb0Jyb3dzZXJVcmwoYCR7c2VhcmNoVXJsfSR7c2VhcmNoVXJsLmluY2x1ZGVzKFwiP1wiKSA/IFwiJlwiIDogXCI/XCJ9dD0ke3RpbWVzdGFtcH1gLCBiYXNlKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3TGlua1RhZyA9IGVsLmNsb25lTm9kZSgpO1xuXHRcdFx0XHRcdG5ld0xpbmtUYWcuaHJlZiA9IG5ldyBVUkwoYnJvd3NlclVybCwgZWwuaHJlZikuaHJlZjtcblx0XHRcdFx0XHRjb25zdCByZW1vdmVPbGRFbCA9ICgpID0+IHtcblx0XHRcdFx0XHRcdGVsLnJlbW92ZSgpO1xuXHRcdFx0XHRcdFx0Y29uc29sZS5kZWJ1ZyhgW3ZpdGVdIGNzcyBob3QgdXBkYXRlZDogJHtzZWFyY2hVcmx9YCk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRuZXdMaW5rVGFnLmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsIHJlbW92ZU9sZEVsKTtcblx0XHRcdFx0XHRuZXdMaW5rVGFnLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCByZW1vdmVPbGRFbCk7XG5cdFx0XHRcdFx0b3V0ZGF0ZWRMaW5rVGFncy5hZGQoZWwpO1xuXHRcdFx0XHRcdGVsLmFmdGVyKG5ld0xpbmtUYWcpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHRcdGF3YWl0IGFjdGl2ZUhtckNsaWVudC5ub3RpZnlMaXN0ZW5lcnMoXCJ2aXRlOmFmdGVyVXBkYXRlXCIsIHBheWxvYWQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcImN1c3RvbVwiOlxuXHRcdFx0YXdhaXQgYWN0aXZlSG1yQ2xpZW50Lm5vdGlmeUxpc3RlbmVycyhwYXlsb2FkLmV2ZW50LCBwYXlsb2FkLmRhdGEpO1xuXHRcdFx0aWYgKHBheWxvYWQuZXZlbnQgPT09IFwidml0ZTp3czpkaXNjb25uZWN0XCIpIHtcblx0XHRcdFx0aWYgKGhhc0RvY3VtZW50ICYmICF3aWxsVW5sb2FkKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coYFt2aXRlXSBzZXJ2ZXIgY29ubmVjdGlvbiBsb3N0LiBQb2xsaW5nIGZvciByZXN0YXJ0Li4uYCk7XG5cdFx0XHRcdFx0Y29uc3Qgc29ja2V0ID0gcGF5bG9hZC5kYXRhLndlYlNvY2tldDtcblx0XHRcdFx0XHRjb25zdCB1cmwgPSBuZXcgVVJMKHNvY2tldC51cmwpO1xuXHRcdFx0XHRcdHVybC5zZWFyY2ggPSBcIlwiO1xuXHRcdFx0XHRcdGF3YWl0IHdhaXRGb3JTdWNjZXNzZnVsUGluZyh1cmwuaHJlZik7XG5cdFx0XHRcdFx0bG9jYXRpb24ucmVsb2FkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCJmdWxsLXJlbG9hZFwiOlxuXHRcdFx0aWYgKHBheWxvYWQuaWZGYWxsYmFjayAmJiAhZ2xvYmFsVGhpcy5fX3ZpdGVfaXNfZmFsbGJhY2tfcGFnZV9fKSBicmVhaztcblx0XHRcdGF3YWl0IGFjdGl2ZUhtckNsaWVudC5ub3RpZnlMaXN0ZW5lcnMoXCJ2aXRlOmJlZm9yZUZ1bGxSZWxvYWRcIiwgcGF5bG9hZCk7XG5cdFx0XHRpZiAoaGFzRG9jdW1lbnQpIHtcblx0XHRcdFx0aWYgKHBheWxvYWQucGF0aCAmJiBwYXlsb2FkLnBhdGguZW5kc1dpdGgoXCIuaHRtbFwiKSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhZ2VQYXRoID0gZGVjb2RlVVJJKGxvY2F0aW9uLnBhdGhuYW1lKTtcblx0XHRcdFx0XHRjb25zdCBwYXlsb2FkUGF0aCA9IGJhc2UgKyBwYXlsb2FkLnBhdGguc2xpY2UoMSk7XG5cdFx0XHRcdFx0aWYgKHBhZ2VQYXRoID09PSBwYXlsb2FkUGF0aCB8fCBwYXlsb2FkLnBhdGggPT09IFwiL2luZGV4Lmh0bWxcIiB8fCBwYWdlUGF0aC5lbmRzV2l0aChcIi9cIikgJiYgcGFnZVBhdGggKyBcImluZGV4Lmh0bWxcIiA9PT0gcGF5bG9hZFBhdGgpIHBhZ2VSZWxvYWQoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH0gZWxzZSBwYWdlUmVsb2FkKCk7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwicHJ1bmVcIjpcblx0XHRcdGF3YWl0IGFjdGl2ZUhtckNsaWVudC5ub3RpZnlMaXN0ZW5lcnMoXCJ2aXRlOmJlZm9yZVBydW5lXCIsIHBheWxvYWQpO1xuXHRcdFx0YXdhaXQgYWN0aXZlSG1yQ2xpZW50LnBydW5lUGF0aHMocGF5bG9hZC5wYXRocyk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwiZXJyb3JcIjpcblx0XHRcdGF3YWl0IGFjdGl2ZUhtckNsaWVudC5ub3RpZnlMaXN0ZW5lcnMoXCJ2aXRlOmVycm9yXCIsIHBheWxvYWQpO1xuXHRcdFx0aWYgKGhhc0RvY3VtZW50KSB7XG5cdFx0XHRcdGNvbnN0IGVyciA9IHBheWxvYWQuZXJyO1xuXHRcdFx0XHRpZiAoZW5hYmxlT3ZlcmxheSkgY3JlYXRlRXJyb3JPdmVybGF5KGVycik7XG5cdFx0XHRcdGVsc2UgY29uc29sZS5lcnJvcihgW3ZpdGVdIEludGVybmFsIFNlcnZlciBFcnJvclxcbiR7ZXJyLm1lc3NhZ2V9XFxuJHtlcnIuc3RhY2t9YCk7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwicGluZ1wiOiBicmVhaztcblx0XHRkZWZhdWx0OiByZXR1cm4gcGF5bG9hZDtcblx0fVxufVxuY29uc3QgZW5hYmxlT3ZlcmxheSA9IHRydWU7XG5jb25zdCBoYXNEb2N1bWVudCA9IFwiZG9jdW1lbnRcIiBpbiBnbG9iYWxUaGlzO1xuZnVuY3Rpb24gY3JlYXRlRXJyb3JPdmVybGF5KGVycikge1xuXHRjbGVhckVycm9yT3ZlcmxheSgpO1xuXHRjb25zdCB7IGN1c3RvbUVsZW1lbnRzIH0gPSBnbG9iYWxUaGlzO1xuXHRpZiAoY3VzdG9tRWxlbWVudHMpIHtcblx0XHRjb25zdCBFcnJvck92ZXJsYXlDb25zdHJ1Y3RvciA9IGN1c3RvbUVsZW1lbnRzLmdldChvdmVybGF5SWQpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobmV3IEVycm9yT3ZlcmxheUNvbnN0cnVjdG9yKGVycikpO1xuXHR9XG59XG5mdW5jdGlvbiBjbGVhckVycm9yT3ZlcmxheSgpIHtcblx0ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChvdmVybGF5SWQpLmZvckVhY2goKG4pID0+IG4uY2xvc2UoKSk7XG59XG5mdW5jdGlvbiBoYXNFcnJvck92ZXJsYXkoKSB7XG5cdHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKG92ZXJsYXlJZCkubGVuZ3RoO1xufVxuZnVuY3Rpb24gd2FpdEZvclN1Y2Nlc3NmdWxQaW5nKHNvY2tldFVybCkge1xuXHRpZiAodHlwZW9mIFNoYXJlZFdvcmtlciA9PT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdGNvbnN0IHZpc2liaWxpdHlNYW5hZ2VyID0ge1xuXHRcdFx0Y3VycmVudFN0YXRlOiBkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUsXG5cdFx0XHRsaXN0ZW5lcnM6IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KClcblx0XHR9O1xuXHRcdGNvbnN0IG9uVmlzaWJpbGl0eUNoYW5nZSA9ICgpID0+IHtcblx0XHRcdHZpc2liaWxpdHlNYW5hZ2VyLmN1cnJlbnRTdGF0ZSA9IGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZTtcblx0XHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2YgdmlzaWJpbGl0eU1hbmFnZXIubGlzdGVuZXJzKSBsaXN0ZW5lcih2aXNpYmlsaXR5TWFuYWdlci5jdXJyZW50U3RhdGUpO1xuXHRcdH07XG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInZpc2liaWxpdHljaGFuZ2VcIiwgb25WaXNpYmlsaXR5Q2hhbmdlKTtcblx0XHRyZXR1cm4gd2FpdEZvclN1Y2Nlc3NmdWxQaW5nSW50ZXJuYWwoc29ja2V0VXJsLCB2aXNpYmlsaXR5TWFuYWdlcik7XG5cdH1cblx0Y29uc3QgYmxvYiA9IG5ldyBCbG9iKFtcblx0XHRcIlxcXCJ1c2Ugc3RyaWN0XFxcIjtcIixcblx0XHRgY29uc3Qgd2FpdEZvclN1Y2Nlc3NmdWxQaW5nSW50ZXJuYWwgPSAke3dhaXRGb3JTdWNjZXNzZnVsUGluZ0ludGVybmFsLnRvU3RyaW5nKCl9O2AsXG5cdFx0YGNvbnN0IGZuID0gJHtwaW5nV29ya2VyQ29udGVudE1haW4udG9TdHJpbmcoKX07YCxcblx0XHRgZm4oJHtKU09OLnN0cmluZ2lmeShzb2NrZXRVcmwpfSlgXG5cdF0sIHsgdHlwZTogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCIgfSk7XG5cdGNvbnN0IG9ialVSTCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG5cdGNvbnN0IHNoYXJlZFdvcmtlciA9IG5ldyBTaGFyZWRXb3JrZXIob2JqVVJMKTtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBvblZpc2liaWxpdHlDaGFuZ2UgPSAoKSA9PiB7XG5cdFx0XHRzaGFyZWRXb3JrZXIucG9ydC5wb3N0TWVzc2FnZSh7IHZpc2liaWxpdHk6IGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSB9KTtcblx0XHR9O1xuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ2aXNpYmlsaXR5Y2hhbmdlXCIsIG9uVmlzaWJpbGl0eUNoYW5nZSk7XG5cdFx0c2hhcmVkV29ya2VyLnBvcnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG5cdFx0XHRkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwidmlzaWJpbGl0eWNoYW5nZVwiLCBvblZpc2liaWxpdHlDaGFuZ2UpO1xuXHRcdFx0c2hhcmVkV29ya2VyLnBvcnQuY2xvc2UoKTtcblx0XHRcdGNvbnN0IGRhdGEgPSBldmVudC5kYXRhO1xuXHRcdFx0aWYgKGRhdGEudHlwZSA9PT0gXCJlcnJvclwiKSB7XG5cdFx0XHRcdHJlamVjdChkYXRhLmVycm9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH0pO1xuXHRcdG9uVmlzaWJpbGl0eUNoYW5nZSgpO1xuXHRcdHNoYXJlZFdvcmtlci5wb3J0LnN0YXJ0KCk7XG5cdH0pO1xufVxuZnVuY3Rpb24gcGluZ1dvcmtlckNvbnRlbnRNYWluKHNvY2tldFVybCkge1xuXHRzZWxmLmFkZEV2ZW50TGlzdGVuZXIoXCJjb25uZWN0XCIsIChfZXZlbnQpID0+IHtcblx0XHRjb25zdCBwb3J0ID0gX2V2ZW50LnBvcnRzWzBdO1xuXHRcdGlmICghc29ja2V0VXJsKSB7XG5cdFx0XHRwb3J0LnBvc3RNZXNzYWdlKHtcblx0XHRcdFx0dHlwZTogXCJlcnJvclwiLFxuXHRcdFx0XHRlcnJvcjogLyogQF9fUFVSRV9fICovIG5ldyBFcnJvcihcInNvY2tldFVybCBub3QgZm91bmRcIilcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2aXNpYmlsaXR5TWFuYWdlciA9IHtcblx0XHRcdGN1cnJlbnRTdGF0ZTogXCJ2aXNpYmxlXCIsXG5cdFx0XHRsaXN0ZW5lcnM6IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KClcblx0XHR9O1xuXHRcdHBvcnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCB7IHZpc2liaWxpdHkgfSA9IGV2ZW50LmRhdGE7XG5cdFx0XHR2aXNpYmlsaXR5TWFuYWdlci5jdXJyZW50U3RhdGUgPSB2aXNpYmlsaXR5O1xuXHRcdFx0Y29uc29sZS5kZWJ1ZyhcIlt2aXRlXSBuZXcgd2luZG93IHZpc2liaWxpdHlcIiwgdmlzaWJpbGl0eSk7XG5cdFx0XHRmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIHZpc2liaWxpdHlNYW5hZ2VyLmxpc3RlbmVycykgbGlzdGVuZXIodmlzaWJpbGl0eSk7XG5cdFx0fSk7XG5cdFx0cG9ydC5zdGFydCgpO1xuXHRcdGNvbnNvbGUuZGVidWcoXCJbdml0ZV0gY29ubmVjdGVkIGZyb20gd2luZG93XCIpO1xuXHRcdHdhaXRGb3JTdWNjZXNzZnVsUGluZ0ludGVybmFsKHNvY2tldFVybCwgdmlzaWJpbGl0eU1hbmFnZXIpLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y29uc29sZS5kZWJ1ZyhcIlt2aXRlXSBwaW5nIHN1Y2Nlc3NmdWxcIik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwb3J0LnBvc3RNZXNzYWdlKHsgdHlwZTogXCJzdWNjZXNzXCIgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRwb3J0LnBvc3RNZXNzYWdlKHtcblx0XHRcdFx0XHR0eXBlOiBcImVycm9yXCIsXG5cdFx0XHRcdFx0ZXJyb3Jcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSwgKGVycm9yKSA9PiB7XG5cdFx0XHRjb25zb2xlLmRlYnVnKFwiW3ZpdGVdIGVycm9yIGhhcHBlbmVkXCIsIGVycm9yKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHBvcnQucG9zdE1lc3NhZ2Uoe1xuXHRcdFx0XHRcdHR5cGU6IFwiZXJyb3JcIixcblx0XHRcdFx0XHRlcnJvclxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHBvcnQucG9zdE1lc3NhZ2Uoe1xuXHRcdFx0XHRcdHR5cGU6IFwiZXJyb3JcIixcblx0XHRcdFx0XHRlcnJvclxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59XG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yU3VjY2Vzc2Z1bFBpbmdJbnRlcm5hbChzb2NrZXRVcmwsIHZpc2liaWxpdHlNYW5hZ2VyLCBtcyA9IDFlMykge1xuXHRmdW5jdGlvbiB3YWl0KG1zKSB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XG5cdH1cblx0YXN5bmMgZnVuY3Rpb24gcGluZygpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc29ja2V0ID0gbmV3IFdlYlNvY2tldChzb2NrZXRVcmwsIFwidml0ZS1waW5nXCIpO1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdGZ1bmN0aW9uIG9uT3BlbigpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHRydWUpO1xuXHRcdFx0XHRcdGNsb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZnVuY3Rpb24gb25FcnJvcigpIHtcblx0XHRcdFx0XHRyZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0XHRjbG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZ1bmN0aW9uIGNsb3NlKCkge1xuXHRcdFx0XHRcdHNvY2tldC5yZW1vdmVFdmVudExpc3RlbmVyKFwib3BlblwiLCBvbk9wZW4pO1xuXHRcdFx0XHRcdHNvY2tldC5yZW1vdmVFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgb25FcnJvcik7XG5cdFx0XHRcdFx0c29ja2V0LmNsb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoXCJvcGVuXCIsIG9uT3Blbik7XG5cdFx0XHRcdHNvY2tldC5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgb25FcnJvcik7XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0ZnVuY3Rpb24gd2FpdEZvcldpbmRvd1Nob3codmlzaWJpbGl0eU1hbmFnZXIpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcblx0XHRcdGNvbnN0IG9uQ2hhbmdlID0gKG5ld1Zpc2liaWxpdHkpID0+IHtcblx0XHRcdFx0aWYgKG5ld1Zpc2liaWxpdHkgPT09IFwidmlzaWJsZVwiKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdHZpc2liaWxpdHlNYW5hZ2VyLmxpc3RlbmVycy5kZWxldGUob25DaGFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0dmlzaWJpbGl0eU1hbmFnZXIubGlzdGVuZXJzLmFkZChvbkNoYW5nZSk7XG5cdFx0fSk7XG5cdH1cblx0aWYgKGF3YWl0IHBpbmcoKSkgcmV0dXJuO1xuXHRhd2FpdCB3YWl0KG1zKTtcblx0d2hpbGUgKHRydWUpIGlmICh2aXNpYmlsaXR5TWFuYWdlci5jdXJyZW50U3RhdGUgPT09IFwidmlzaWJsZVwiKSB7XG5cdFx0aWYgKGF3YWl0IHBpbmcoKSkgYnJlYWs7XG5cdFx0YXdhaXQgd2FpdChtcyk7XG5cdH0gZWxzZSBhd2FpdCB3YWl0Rm9yV2luZG93U2hvdyh2aXNpYmlsaXR5TWFuYWdlcik7XG59XG5jb25zdCBzaGVldHNNYXAgPSAvKiBAX19QVVJFX18gKi8gbmV3IE1hcCgpO1xuY29uc3QgbGlua1NoZWV0c01hcCA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgTWFwKCk7XG5pZiAoXCJkb2N1bWVudFwiIGluIGdsb2JhbFRoaXMpIHtcblx0ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChcInN0eWxlW2RhdGEtdml0ZS1kZXYtaWRdXCIpLmZvckVhY2goKGVsKSA9PiB7XG5cdFx0c2hlZXRzTWFwLnNldChlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXZpdGUtZGV2LWlkXCIpLCBlbCk7XG5cdH0pO1xuXHRkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKFwibGlua1tyZWw9XFxcInN0eWxlc2hlZXRcXFwiXVtkYXRhLXZpdGUtZGV2LWlkXVwiKS5mb3JFYWNoKChlbCkgPT4ge1xuXHRcdGxpbmtTaGVldHNNYXAuc2V0KGVsLmdldEF0dHJpYnV0ZShcImRhdGEtdml0ZS1kZXYtaWRcIiksIGVsKTtcblx0fSk7XG59XG5sZXQgbGFzdEluc2VydGVkU3R5bGU7XG5mdW5jdGlvbiB1cGRhdGVTdHlsZShpZCwgY29udGVudCkge1xuXHRpZiAobGlua1NoZWV0c01hcC5oYXMoaWQpKSByZXR1cm47XG5cdGxldCBzdHlsZSA9IHNoZWV0c01hcC5nZXQoaWQpO1xuXHRpZiAoIXN0eWxlKSB7XG5cdFx0c3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG5cdFx0c3R5bGUuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvY3NzXCIpO1xuXHRcdHN0eWxlLnNldEF0dHJpYnV0ZShcImRhdGEtdml0ZS1kZXYtaWRcIiwgaWQpO1xuXHRcdHN0eWxlLnRleHRDb250ZW50ID0gY29udGVudDtcblx0XHRpZiAoY3NwTm9uY2UpIHN0eWxlLnNldEF0dHJpYnV0ZShcIm5vbmNlXCIsIGNzcE5vbmNlKTtcblx0XHRpZiAoIWxhc3RJbnNlcnRlZFN0eWxlKSB7XG5cdFx0XHRkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRsYXN0SW5zZXJ0ZWRTdHlsZSA9IHZvaWQgMDtcblx0XHRcdH0sIDApO1xuXHRcdH0gZWxzZSBsYXN0SW5zZXJ0ZWRTdHlsZS5pbnNlcnRBZGphY2VudEVsZW1lbnQoXCJhZnRlcmVuZFwiLCBzdHlsZSk7XG5cdFx0bGFzdEluc2VydGVkU3R5bGUgPSBzdHlsZTtcblx0fSBlbHNlIGlmIChzdHlsZS50ZXh0Q29udGVudCAhPT0gY29udGVudCkgc3R5bGUudGV4dENvbnRlbnQgPSBjb250ZW50O1xuXHRzaGVldHNNYXAuc2V0KGlkLCBzdHlsZSk7XG59XG5mdW5jdGlvbiByZW1vdmVTdHlsZShpZCkge1xuXHRpZiAobGlua1NoZWV0c01hcC5oYXMoaWQpKSB7XG5cdFx0ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgbGlua1tyZWw9XCJzdHlsZXNoZWV0XCJdW2RhdGEtdml0ZS1kZXYtaWQ9XCIke0NTUy5lc2NhcGUoaWQpfVwiXWApLmZvckVhY2goKGVsKSA9PiBlbC5yZW1vdmUoKSk7XG5cdFx0bGlua1NoZWV0c01hcC5kZWxldGUoaWQpO1xuXHR9XG5cdGNvbnN0IHN0eWxlID0gc2hlZXRzTWFwLmdldChpZCk7XG5cdGlmIChzdHlsZSkge1xuXHRcdGRvY3VtZW50LmhlYWQucmVtb3ZlQ2hpbGQoc3R5bGUpO1xuXHRcdHNoZWV0c01hcC5kZWxldGUoaWQpO1xuXHR9XG59XG5mdW5jdGlvbiBjcmVhdGVIb3RDb250ZXh0KG1vZHVsZVVybCkge1xuXHRyZXR1cm4gbmV3IEhNUkNvbnRleHQoaG1yQ2xpZW50LCBtb2R1bGVVcmwpO1xufVxuLyoqXG4qIHVybHMgaGVyZSBhcmUgZHluYW1pYyBpbXBvcnQoKSB1cmxzIHRoYXQgY291bGRuJ3QgYmUgc3RhdGljYWxseSBhbmFseXplZFxuKi9cbmZ1bmN0aW9uIGluamVjdFF1ZXJ5KHVybCwgcXVlcnlUb0luamVjdCkge1xuXHRpZiAodXJsWzBdICE9PSBcIi5cIiAmJiB1cmxbMF0gIT09IFwiL1wiKSByZXR1cm4gdXJsO1xuXHRjb25zdCBwYXRobmFtZSA9IHVybC5yZXBsYWNlKC9bPyNdLiokLywgXCJcIik7XG5cdGNvbnN0IHsgc2VhcmNoLCBoYXNoIH0gPSBuZXcgVVJMKHVybCwgXCJodHRwOi8vdml0ZS5kZXZcIik7XG5cdHJldHVybiBgJHtwYXRobmFtZX0/JHtxdWVyeVRvSW5qZWN0fSR7c2VhcmNoID8gYCZgICsgc2VhcmNoLnNsaWNlKDEpIDogXCJcIn0ke2hhc2ggfHwgXCJcIn1gO1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBFcnJvck92ZXJsYXksIGNyZWF0ZUhvdENvbnRleHQsIGluamVjdFF1ZXJ5LCByZW1vdmVTdHlsZSwgdXBkYXRlU3R5bGUgfTtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxNQUFNLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFDN0UsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUN0RixHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyx1REFBdUQsQ0FBQztBQUNwRixHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDNUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDWixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNqQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxD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Q0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUMvQixNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUTtBQUNsRCxDQUFDLENBQUM7QUFDRixDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSTtBQUM3RCxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUM7QUFDbkUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUk7QUFDL0IsQ0FBQztBQUNELFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDcEIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDO0FBQy9GO0FBQ0EsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDdkYsUUFBUSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2hELENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7QUFDaEcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVU7QUFDN0Q7QUFDQSxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQy9CLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdEQsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FB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QUFDdkIsQ0FBQyxDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBQ0YsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDdkksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDOUMsQ0FBQyxNQUFNLENBQUM7QUFDUixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztBQUNkLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMxQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztBQUM1QixDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN2QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDdkUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUk7QUFDL0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUN4QyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDO0FBQ2hELENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNO0FBQzNCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDO0FBQzdELENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDbkMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJO0FBQzFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7QUFDdkMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDbkMsQ0FB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QyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzNDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ3BCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzNFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU07QUFDWixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0FBQ2YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDcEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQztBQUNqQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDdEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDYixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2xCLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMs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S0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQ3hDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7QUFDNUQsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUNsRixDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDbEQsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQ2xGLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDaEcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztBQUN4QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUNqRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2pHO0FBQ0EsUUFBUSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3ZELENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDOUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQ3hCLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVE7QUFDOUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3RyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMzRjtBQUNBLFFBQVEsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEQsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO0FBQ3RELENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xCLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN0RyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDO0FBQzNCO0FBQ0EsUUFBUSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzNELENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7QUFDaEMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO0FBQ3JELENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xCLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDckIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQztBQUN4RixDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JFLENBQUM7QUFDRCxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDO0FBQzNCO0FBQ0EsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM3QixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMzRDtBQUNBLENBQUMsQ0FBQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDO0FBQ3BDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN0RixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU07QUFDN0IsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN2QyxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7QUFDdkIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDakIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQztBQUNoQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNULENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtBQUNSLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDVixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztBQUN6QyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7QUFDN0MsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ25CLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBQ0QsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFD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Q0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDL0QsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTO0FBQ2hDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN2QixDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDckIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDWixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM1RCxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQztBQUMxRixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNaLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzVELENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDN0MsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ2pDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ1osQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDNUQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUN0RCxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDOUQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDWixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQztBQUM3QyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQ2xCLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDN0MsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUNYLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUN2QixDQUFDLENBQUMsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3ZCLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTO0FBQzVCLENBQUMsQ0FBQztBQUNGLENBQUMsQ0FBQyxDQUFDO0FBQ0gsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3RLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDL0MsQ0FBQyxNQUFNLENBQUMsT0FBTztBQUNmO0FBQ0EsUUFBUSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3BDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSztBQUM1QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUNwRixDQUFDLEdBQUcsQ0FBQztBQUNMLENBQUMsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztBQUM1QixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDVCxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7QUFDdEIsQ0FBQztBQUNEO0FBQ0EsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxHQUFHO0FBQ3RDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN6QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMs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QUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3hGLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQy9ELENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNyRCxDQUFDO0FBQ0QsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDdEMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztBQUM5SCxDQUFDO0FBQ0QsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDYixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDbkQsQ0FBQztBQUNELENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ1gsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBQ2pELENBQUM7QUFDRCxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNaLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3JCLENBQUMsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDdkYsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDcEQsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDdkIsQ0FBQyxDQUFDLENBQUMsT0FBTztBQUNWLENBQUMsQ0FBQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDL0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7QUFDdkIsQ0FBQyxDQUFDLENBQUMsT0FBTztBQUNWLENBQUMsQ0FBQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3RixDQUFDO0FBQ0QsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDZixDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM1QixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN4QyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUNwQixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUMzQixDQUFDLENBQUMsQ0FBQztBQUNILENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQztBQUM3QyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7QUFDN0IsQ0FBQztBQUNELENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ2hCLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2pDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO0FBQ2xDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNO0FBQ2xDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxD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S0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN6QixDQUFDLENBQUMsR0FBRyxDQUFDO0FBQ04sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO0FBQzlDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN6RCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN6QyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztBQUN0QyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDN0MsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNaLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNyRCxDQUFDLENBQUM7QUFDRixDQUFDO0FBQ0QsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUM3QixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7QUFDdkYsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUN6SSxDQUFDO0FBQ0QsQ0FBQyxDQUFDLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztBQUN6RCxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUk7QUFDNUQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMs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QVEsQ0FBQyxDQUFDLEtBQUs7QUFDakIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLO0FBQ2hCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ1IsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDVCxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQ2IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUNkLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNwQixDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUNYLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUNqQzs7QUFFQSxDQUFDLE1BQU0sQ0FBQztBQUNSLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDL0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsQixDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUk7QUFDakIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUM1QixDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHO0FBQ3hCLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSTtBQUNuQixDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHO0FBQ3BCLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRO0FBQ3BCLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7QUFDdEMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHO0FBQ2hDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBQ3hFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNO0FBQ2xCLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUNsQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBRztBQUNoQixDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUk7QUFDbEI7O0FBRUEsR0FBRyxDQUFDO0FBQ0osQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUMvQixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUk7QUFDakIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2YsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHO0FBQ3BCLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNwQixDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUk7QUFDdkI7O0FBRUEsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO0FBQ3ZCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJO0FBQ2Y7O0FBRUEsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztBQUM3QixDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSztBQUNoQixDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRztBQUNiOztBQUVBLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDO0FBQ25DLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUc7QUFDbEIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHO0FBQ3BCOztBQUVBLEdBQUcsQ0FBQyxLQUFLLENBQUM7QUFDVixDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUk7QUFDdkI7O0FBRUEsQ0FBQyxPQUFPLENBQUM7QUFDVCxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xCLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRztBQUNsQixDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJO0FBQ3ZCOztBQUVBLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztBQUNkLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUNuQjs7QUFFQSxDQUFDLE1BQU0sQ0FBQztBQUNSLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUN0Qjs7QUFFQSxDQUFDLElBQUksQ0FBQztBQUNOLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNwQixDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDbEIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSTtBQUN2QixDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHO0FBQ3ZCOztBQUVBLENBQUMsS0FBSyxDQUFDO0FBQ1AsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ3RCOztBQUVBLENBQUMsS0FBSyxDQUFDO0FBQ1AsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJO0FBQ2pCLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUNuQjs7QUFFQSxDQUFDLEdBQUcsQ0FBQztBQUNMLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSTtBQUNqQixDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHO0FBQ2IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRztBQUM3QixDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUk7QUFDbkIsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsQjs7QUFFQSxJQUFJLENBQUM7QUFDTCxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUk7QUFDakIsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUMvQixDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDdEI7O0FBRUEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0FBQ1gsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxTQUFTO0FBQzVCLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPO0FBQ2pCOztBQUVBLEdBQUcsQ0FBQztBQUNKLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEIsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVM7QUFDakcsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSztBQUNwQixDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUc7QUFDbEIsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO0FBQ25DLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQzNCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJO0FBQ3pCLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUs7QUFDeEIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU87QUFDN0MsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLO0FBQ3JCLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMvQixDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU87QUFDdkI7QUFDQSxDQUFDO0FBQ0QsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN0QyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQ2xCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRO0FBQ2hCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDWixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2hCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNO0FBQ2QsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNaLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7QUFDakIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU87QUFDZixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ2IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNoQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNkLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNkLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO0FBQ3RCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSTtBQUNwQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNkLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFDZCxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSTtBQUNaLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNiLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDZixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSztBQUNiLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNiLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDZixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSztBQUNiLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNiLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDYixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRztBQUNYLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUNwWSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3RCxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFDOUQsS0FBSyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVU7QUFDN0MsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7QUFDN0MsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNoQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDVCxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakQsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDekMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDM0IsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO0FBQzNELENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPO0FBQy9FLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQzVDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN2RSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUNyRixDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUMzQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDckQsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUN2QyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdEUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN2QyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDZixDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDM0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FB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QUF3QixDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtBQUMvSSxDQUFDO0FBQ0QsQ0FBQyxFQUFFLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdkQsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFF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LENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDMUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU07QUFDbkIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUN0SCxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDcEMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUN0QyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSTtBQUN4RCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDL0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2pCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDM0QsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDZixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztBQUNyRCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUM7QUFDdEQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFDN0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDO0FBQ3pCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ04sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNyRSxDQUFDLENBQUMsQ0FBQyxLQUFLO0FBQ1IsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNmLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO0FBQ3JFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUMvQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ3BDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDekUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUztBQUMxQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO0FBQ3BDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDcEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO0FBQzFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDdEIsQ0FBQyxDQUFDLENB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LFNBQVMsQ0FBQyxDQUFDO0FBQzFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzlDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUM5QixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNsQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO0FBQ3BCLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDakIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7QUFDMUQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMsTUFBTTtBQUNULENBQUMsQ0FBQztBQUNGLENBQUMsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0FBQzVCLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO0FBQzFCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFDdEMsQ0FBQyxDQUFDLENBQUM7QUFDSCxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzlDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUk7QUFDcEMsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxVQUFVO0FBQzlDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7QUFDNUQsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztBQUMzRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNkLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQy9DLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN6RSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDMUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQ1AsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN6QyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDbkIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO0FBQ3JCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUNsQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDaEIsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQ2hELENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUNQLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztBQUNyQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDbEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDbkIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO0FBQ3JCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUNsQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0g7QUFDQSxLQUFLLENBQUMsUUFBUSxDQUFDLDZCQUE2QixDQUFDLFNBQVMsQ0FBQyxDQUFD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