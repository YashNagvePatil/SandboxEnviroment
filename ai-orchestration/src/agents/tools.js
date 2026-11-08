import axios from "axios";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates tools dynamically configured for a specific sandbox.
 * Tools accept runtime execution context and an event writer.
 * Matches the original sandbox agent API format:
 *   GET  /list-files                      → { files: [...] }
 *   GET  /read-files?files=a,b            → { files: [{"/path": "content"}, ...] }
 *   PATCH /update-files  { updates: [{file, content}] }
 * @param {string} defaultSandboxId
 * @param {Function} [defaultWriter]
 */
export function createTools(defaultSandboxId, defaultWriter = null) {
  const getBaseUrl = (config) => {
    const sandboxId = config?.configurable?.sandboxId || defaultSandboxId;
    return `http://sandbox-service-${sandboxId}:3000`;
  };

  const emitEvent = (config, payload) => {
    // Priority 1: Call defaultWriter passed to createTools
    if (typeof defaultWriter === "function") {
      try {
        defaultWriter({
          timestamp: new Date().toISOString(),
          ...payload,
        });
      } catch (err) {
        console.warn("[Tool: defaultWriter Error]:", err.message);
      }
    }

    // Priority 2: Also call LangGraph internal custom writer if present
    const lgWriter = config?.writer || config?.configurable?.writer;
    if (typeof lgWriter === "function" && lgWriter !== defaultWriter) {
      try {
        lgWriter(payload);
      } catch (err) {
        // ignore
      }
    }
  };

  // ── listFiles ─────────────────────────────────────────────────────────────
  const listFiles = tool(
    async (_, config) => {
      const baseUrl = getBaseUrl(config);
      const projectId = config?.configurable?.projectId;

      emitEvent(config, {
        event: "tool_start",
        tool: "listFiles",
        message: "Exploring project workspace file structure...",
      });

      try {
        console.log(`[Tool: listFiles] Listing files from ${baseUrl}${projectId ? ` (Project: ${projectId})` : ""}`);
        const response = await axios.get(`${baseUrl}/list-files`, { timeout: 10000 });
        const files = response.data.files || response.data.elements || [];

        emitEvent(config, {
          event: "tool_end",
          tool: "listFiles",
          message: `Found ${files.length} project files.`,
          data: { filesCount: files.length, files },
        });

        return JSON.stringify(files);
      } catch (err) {
        console.error(`[Tool: listFiles Error]:`, err.message);

        emitEvent(config, {
          event: "tool_error",
          tool: "listFiles",
          message: `Failed to list files: ${err.message}`,
        });

        return `Error listing files: ${err.message}`;
      }
    },
    {
      name: "listFiles",
      description:
        "List all existing files in the workspace project directory. Always call this first to explore the project structure.",
      schema: z.object({}),
    }
  );

  // ── readFiles ─────────────────────────────────────────────────────────────
  const readFiles = tool(
    async ({ files }, config) => {
      const baseUrl = getBaseUrl(config);
      const projectId = config?.configurable?.projectId;

      emitEvent(config, {
        event: "tool_start",
        tool: "readFiles",
        message: `Inspecting source files: ${files.join(", ")}...`,
        data: { files },
      });

      try {
        console.log(`[Tool: readFiles] Reading files: ${files.join(", ")}${projectId ? ` (Project: ${projectId})` : ""}`);
        const response = await axios.get(
          `${baseUrl}/read-files?files=${files.join(",")}`,
          { timeout: 10000 }
        );
        const data = response.data.files || response.data.results || response.data;

        emitEvent(config, {
          event: "tool_end",
          tool: "readFiles",
          message: `Successfully read ${files.length} file(s).`,
          data: { filesRead: files },
        });

        return JSON.stringify(data);
      } catch (err) {
        console.error(`[Tool: readFiles Error]:`, err.message);

        emitEvent(config, {
          event: "tool_error",
          tool: "readFiles",
          message: `Failed to read files: ${err.message}`,
        });

        return `Error reading files: ${err.message}`;
      }
    },
    {
      name: "readFiles",
      description:
        "Read the source code and contents of specified files. Provide relative paths like ['src/App.jsx', 'src/App.css'].",
      schema: z.object({
        files: z
          .array(z.string())
          .describe("List of relative file paths to read"),
      }),
    }
  );

  // ── updateFiles ───────────────────────────────────────────────────────────
  const updateFiles = tool(
    async ({ files }, config) => {
      const baseUrl = getBaseUrl(config);
      const projectId = config?.configurable?.projectId;
      const filePaths = files.map((f) => f.path);

      emitEvent(config, {
        event: "tool_start",
        tool: "updateFiles",
        message: `Writing updates to ${files.length} file(s): ${filePaths.join(", ")}...`,
        data: { files: filePaths },
      });

      try {
        console.log(`[Tool: updateFiles] Updating/creating ${files.length} file(s) via ${baseUrl}${projectId ? ` (Project: ${projectId})` : ""}`);

        // Convert {path, content} → {file, content} for original server format
        const updates = files.map((f) => ({
          file: f.path,
          content: f.content,
        }));

        const response = await axios.patch(
          `${baseUrl}/update-files`,
          {
            updates,                        // original format: {file, content}
            files: files,                   // alternate format: {path, content}
          },
          { timeout: 30000 }
        );

        emitEvent(config, {
          event: "tool_end",
          tool: "updateFiles",
          message: `Successfully saved ${files.length} file(s). Vite Hot Module Reload (HMR) triggered live preview update!`,
          data: { filesUpdated: filePaths },
        });

        return JSON.stringify(response.data.results || response.data);
      } catch (err) {
        console.error(`[Tool: updateFiles Error]:`, err.message);

        emitEvent(config, {
          event: "tool_error",
          tool: "updateFiles",
          message: `Failed to update files: ${err.message}`,
        });

        return `Error updating files: ${err.message}`;
      }
    },
    {
      name: "updateFiles",
      description:
        "Create or update files in the workspace with new code. This will immediately update the live preview via Vite HMR. Pass the relative path and full code content.",
      schema: z.object({
        files: z
          .array(
            z.object({
              path: z
                .string()
                .describe(
                  "Relative file path, e.g. 'src/App.jsx' or 'src/App.css'"
                ),
              content: z
                .string()
                .describe("The full code content to write to the file"),
            })
          )
          .describe("Array of files to create or update"),
      }),
    }
  );

  return [listFiles, readFiles, updateFiles];
}
