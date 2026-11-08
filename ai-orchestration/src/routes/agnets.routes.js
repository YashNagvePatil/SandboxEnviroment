import { Router } from "express";
import agent from "../agents/code.agent.js";

const agentRouter = Router();

agentRouter.post("/invoke", async (req,res) => {
  try {
    const { messages, sandboxId, projectId, context, stream } = req.body;

    if (!messages) {
      return res.status(400).json({ error: "messages is required" });
    }

    if (!sandboxId) {
      return res.status(400).json({
        error: "sandboxId is required in request body. Example: { sandboxId: '<id>', messages: [...] }",
      });
    }

    // Combine top-level context helpers (e.g. projectId) into unified context
    const mergedContext = {
      ...(projectId ? { projectId } : {}),
      ...(typeof context === "object" && context !== null ? context : {}),
    };

    // Determine if client requested streaming (SSE)
    const isStream =
      stream === true ||
      req.query.stream === "true" ||
      req.headers.accept === "text/event-stream";

    // ── Streaming Mode (Server-Sent Events) ──────────────────────────────────
    if (isStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Prevents NGINX from buffering SSE stream
      res.flushHeaders?.();

      const abortController = new AbortController();
      let clientDisconnected = false;
      res.on("close", () => {
        if (!res.writableEnded) {
          clientDisconnected = true;
          abortController.abort();
        }
      });

      const sendSSE = (eventObj) => {
        if (!clientDisconnected && !res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify(eventObj)}\n\n`);
            if (typeof res.flush === "function") res.flush();
          } catch (e) {
            console.error("[SSE send error]:", e.message);
          }
        }
      };

      sendSSE({
        event: "session_start",
        sandboxId,
        projectId: mergedContext.projectId || null,
        timestamp: new Date().toISOString(),
      });

      try {
        const response = await agent.stream({
          sandboxId,
          messages: Array.isArray(messages) ? messages : [{ role: "user", content: messages }],
          context: mergedContext,
          onProgress: sendSSE,
          signal: abortController.signal,
        });

        if (clientDisconnected) return;

        const replyText =
          typeof response?.content === "string"
            ? response.content
            : JSON.stringify(response?.content || response || "Task completed");

        sendSSE({
          event: "completed",
          sandboxId,
          projectId: mergedContext.projectId || null,
          previewUrl: `http://${sandboxId}.preview.localhost`,
          response: replyText,
          timeline: response.timeline || [],
          timestamp: new Date().toISOString(),
        });

        if (!clientDisconnected && !res.writableEnded) {
          res.write("event: end\ndata: {}\n\n");
          res.end();
        }
        return;
      } catch (err) {
        if (clientDisconnected) return;
        console.error("[Agent Streaming Error in SSE]:", err);
        sendSSE({
          event: "error",
          error: "Agent execution failed",
          details: err?.message || "Unknown error",
          timestamp: new Date().toISOString(),
        });
        if (!res.writableEnded) res.end();
        return;
      }
    }

    // ── Standard JSON Response Mode ─────────────────────────────────────────
    const response = await agent.invoke({
      sandboxId,
      messages: Array.isArray(messages) ? messages : [{ role: "user", content: messages }],
      context: mergedContext,
    });

    const replyText =
      typeof response?.content === "string"
        ? response.content
        : JSON.stringify(response?.content || response || "Task completed");

    return res.status(200).json({
      message: "Agent executed successfully",
      sandboxId,
      projectId: mergedContext.projectId || null,
      previewUrl: `http://${sandboxId}.preview.localhost`,
      response: replyText,
      context: response.context || mergedContext,
      timeline: response.timeline || [],
    });
  } catch (error) {
    console.error("Error invoking agent:", error);
    return res.status(500).json({
      error: "Failed to invoke agent",
      details: error?.message || "Unknown error",
    });
  }
});

export default agentRouter;
