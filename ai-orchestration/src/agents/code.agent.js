import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ChatGoogle } from "@langchain/google";
import { createAgent } from "langchain";
import { createTools } from "./tools.js";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SYSTEM_PROMPT = `You are an expert full-stack React developer working inside a cloud sandbox environment.
The project is a React web application powered by Vite.
You have access to tools to interact directly with the project workspace:
1. 'listFiles': lists all existing files in the workspace.
2. 'readFiles': reads existing code in files (e.g. 'src/App.jsx', 'package.json', 'src/App.css').
3. 'updateFiles': writes new code or updates existing files. When you write to 'src/App.jsx' or CSS files, Vite Hot Module Reloading (HMR) will instantly render it on the user's live preview screen!

INSTRUCTIONS:
- When a user asks you to build or update something (e.g. "create a snake game"):
  1. First inspect the existing project files using 'listFiles' or 'readFiles'.
  2. Implement the complete, working React application with interactive state and beautiful CSS styling.
  3. ALWAYS call the 'updateFiles' tool to save the code into 'src/App.jsx' and 'src/App.css' so the preview updates!
  4. Once files are saved, provide a concise summary of what was implemented.`;

// Models to try in order (fallback chain)
const MODEL_FALLBACKS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
];



/**
 * Runs the coding agent for a specific sandbox and messages.
 * Automatically retries with fallback models on quota/overload errors.
 */
export async function runAgent({ sandboxId, messages }, modelIndex = 0) {
  const modelName = MODEL_FALLBACKS[modelIndex] ?? MODEL_FALLBACKS[0];
  console.log(`[Agent] Using model: ${modelName} for sandbox ${sandboxId}`);

  const model = new ChatGoogle({
    model: modelName,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.2,
  });

  const tools = createTools(sandboxId);

  const agent = createAgent({
    model,
    tools,
  });

  const normalizedMessages = Array.isArray(messages)
    ? messages
    : [{ role: "user", content: messages ?? "" }];

  const langchainMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    ...normalizedMessages.map((msg) => {
      const content =
        typeof msg?.content === "string"
          ? msg.content
          : JSON.stringify(msg?.content ?? "");

      if (msg?.role === "assistant") {
        return new AIMessage(content);
      }
      return new HumanMessage(content);
    }),
  ];

  console.log(`[Agent] Executing coding agent for sandbox ${sandboxId}...`);
  try {
    const result = await agent.invoke({
      messages: langchainMessages,
    });

    const lastMessage = Array.isArray(result?.messages)
      ? result.messages[result.messages.length - 1]
      : result;

    return {
      content: lastMessage?.content || result?.content || "Files updated successfully.",
      messages: result?.messages,
    };
  } catch (err) {
    const isRetryable =
      err?.message?.includes("high demand") ||
      err?.message?.includes("overloaded") ||
      err?.message?.includes("quota") ||
      err?.message?.includes("429") ||
      err?.message?.includes("503");

    if (isRetryable && modelIndex + 1 < MODEL_FALLBACKS.length) {
      console.warn(
        `[Agent] Model ${modelName} failed: "${err.message?.slice(0, 80)}". Trying fallback model...`
      );
      return runAgent({ sandboxId, messages }, modelIndex + 1);
    }
    throw err;
  }
}

export default {
  invoke: runAgent,
};
