import { Router } from "express";
import agent from "../agents/code.agent.js";

const agentRouter = Router();

agentRouter.post("/invoke", async (req, res) => {
  try {
    const { messages, sandboxId } = req.body;

    if (!messages) {
      return res.status(400).json({ error: "messages is required" });
    }

    if (!sandboxId) {
      return res.status(400).json({
        error: "sandboxId is required in request body. Example: { sandboxId: '<id>', messages: [...] }",
      });
    }

    const response = await agent.invoke({
      sandboxId,
      messages: Array.isArray(messages) ? messages : [{ role: "user", content: messages }],
    });

    return res.status(200).json({
      message: "Agent executed successfully",
      sandboxId,
      previewUrl: `http://${sandboxId}.preview.localhost`,
      response: response.content || response,
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
