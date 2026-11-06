import axios from "axios";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates tools dynamically configured for a specific sandbox.
 * Matches the original sandbox agent API format:
 *   GET  /list-files                      → { files: [...] }
 *   GET  /read-files?files=a,b            → { files: [{"/path": "content"}, ...] }
 *   PATCH /update-files  { updates: [{file, content}] }
 * @param {string} sandboxId
 */
export function createTools(sandboxId) {
  const baseUrl = `http://sandbox-service-${sandboxId}:3000`;

  // ── listFiles ─────────────────────────────────────────────────────────────
  const listFiles = tool(
    async () => {
      try {
        console.log(`[Tool: listFiles] Listing files from ${baseUrl}`);
        const response = await axios.get(`${baseUrl}/list-files`, { timeout: 10000 });
        const files = response.data.files || response.data.elements || [];
        return JSON.stringify(files);
      } catch (err) {
        console.error(`[Tool: listFiles Error]:`, err.message);
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
    async ({ files }) => {
      try {
        console.log(`[Tool: readFiles] Reading files: ${files.join(", ")}`);
        const response = await axios.get(
          `${baseUrl}/read-files?files=${files.join(",")}`,
          { timeout: 10000 }
        );
        // Server returns { files: [{"/workspace/src/App.jsx": "content"}, ...] }
        // Also handle { results: [...] } for newer versions
        const data = response.data.files || response.data.results || response.data;
        return JSON.stringify(data);
      } catch (err) {
        console.error(`[Tool: readFiles Error]:`, err.message);
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
    async ({ files }) => {
      try {
        console.log(`[Tool: updateFiles] Updating/creating ${files.length} file(s)`);

        // Convert {path, content} → {file, content} for original server format
        // Also send 'files' field for newer server versions
        const updates = files.map((f) => ({
          file: f.path,
          content: f.content,
        }));

        const response = await axios.patch(
          `${baseUrl}/update-files`,
          {
            updates,                        // original format: {file, content}
            files: files,                   // new format: {path, content}
          },
          { timeout: 30000 }
        );
        return JSON.stringify(response.data.results || response.data);
      } catch (err) {
        console.error(`[Tool: updateFiles Error]:`, err.message);
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
