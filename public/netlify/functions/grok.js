import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION = `You are Trosmos AI, the premium intelligent copilot inside Trosmos OS 4.4 — a real AI-native operating system that runs in the browser.

Be helpful, concise, friendly, and precise. Prefer short, actionable answers.

You control the OS through structured tools: open/close/focus apps, full filesystem operations (list, create, read, write, rename, move, delete, search), change permitted settings, and show notifications. Always prefer calling a tool over merely describing the action. After a tool runs, the result is returned so you can confirm success or report the real error.

Never invent private user data, fake system metrics, or claim an action succeeded when no tool was invoked. Stay in character as the OS copilot. Use light humor when it fits. If a capability is limited by the browser (e.g. embedding external websites), explain the limitation honestly.

Destructive actions (delete, overwrite) are gated by user permission on the client; respect that boundary.`;

// Tool declarations matching the frontend AI_TOOLS
const TOOL_DECLARATIONS = [
  {
    name: "open_app",
    description: "Open or focus an application window",
    parameters: {
      type: "OBJECT",
      properties: {
        app: {
          type: "STRING",
          description: "ai | files | browser | settings | app-store | task-manager | terminal | calculator | notes | clock | clipboard | help"
        }
      },
      required: ["app"]
    }
  },
  {
    name: "close_app",
    description: "Close an application window",
    parameters: {
      type: "OBJECT",
      properties: {
        app: { type: "STRING" }
      },
      required: ["app"]
    }
  },
  {
    name: "list_directory",
    description: "List files and folders in a directory",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "e.g. /Home/Documents" }
      },
      required: ["path"]
    }
  },
  {
    name: "create_folder",
    description: "Create a new folder",
    parameters: {
      type: "OBJECT",
      properties: {
        parent: { type: "STRING" },
        name: { type: "STRING" }
      },
      required: ["parent", "name"]
    }
  },
  {
    name: "create_file",
    description: "Create a new text or markdown file",
    parameters: {
      type: "OBJECT",
      properties: {
        parent: { type: "STRING" },
        name: { type: "STRING" },
        content: { type: "STRING" }
      },
      required: ["parent", "name"]
    }
  },
  {
    name: "read_file",
    description: "Read the contents of a file",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING" }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Overwrite content of an existing file",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING" },
        content: { type: "STRING" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "delete_path",
    description: "Permanently delete a file or folder",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING" }
      },
      required: ["path"]
    }
  },
  {
    name: "move_path",
    description: "Move a file or folder to a new parent",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING" },
        newParent: { type: "STRING" }
      },
      required: ["path", "newParent"]
    }
  },
  {
    name: "rename_path",
    description: "Rename a file or folder",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING" },
        newName: { type: "STRING" }
      },
      required: ["path", "newName"]
    }
  },
  {
    name: "search_files",
    description: "Search files by name or content",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING" }
      },
      required: ["query"]
    }
  },
  {
    name: "change_setting",
    description: "Change accent color or wallpaper",
    parameters: {
      type: "OBJECT",
      properties: {
        key: { type: "STRING" },
        value: { type: "STRING" }
      },
      required: ["key", "value"]
    }
  },
  {
    name: "show_notification",
    description: "Show a system notification",
    parameters: {
      type: "OBJECT",
      properties: {
        message: { type: "STRING" },
        type: { type: "STRING" }
      },
      required: ["message"]
    }
  }
];

export async function handler(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const { message, conversation = [], toolResults = null } = body;

    // Tool-result continuation turn (after frontend executed tools)
    if (toolResults && Array.isArray(toolResults)) {
      // Client is sending back tool results; we continue the conversation
      // For simplicity in this serverless function we re-generate with context
    }

    if (typeof message !== "string" || !message.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Message is required and must be a non-empty string",
        }),
      };
    }

    if (message.length > 2000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Message too long (max 2000 characters)" }),
      };
    }

    if (!Array.isArray(conversation) || conversation.length > 40) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid conversation" }),
      };
    }

    if (!process.env.GEMINI_API_KEY) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          error: "AI service not configured",
          details: "GEMINI_API_KEY environment variable is missing",
        }),
      };
    }

    const safeConversation = conversation
      .filter(
        (m) =>
          m &&
          typeof m.role === "string" &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .slice(-12)
      .map((m) => ({
        role: m.role === "assistant" || m.role === "model" ? "model" : "user",
        parts: [{ text: String(m.content).slice(0, 4000) }],
      }));

    const contents = [
      ...safeConversation,
      {
        role: "user",
        parts: [{ text: message.trim() }],
      },
    ];

    // If tool results are provided, append them as function response parts
    // (simplified: we append a system-style summary for the model)
    if (toolResults && Array.isArray(toolResults) && toolResults.length > 0) {
      const summary = toolResults
        .map((t) => `Tool ${t.name}: ${t.ok ? JSON.stringify(t.result) : "Error: " + t.error}`)
        .join("\n");
      contents.push({
        role: "user",
        parts: [{ text: `Tool execution results:\n${summary}\n\nPlease respond to the user based on these results.` }],
      });
    }

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 800,
        topP: 0.95,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      },
    });

    // Check for function calls
    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          type: "tool_calls",
          toolCalls: functionCalls.map((p) => ({
            name: p.functionCall.name,
            args: p.functionCall.args || {},
          })),
          // Also return any text part if present
          reply: parts.find((p) => p.text)?.text || null,
        }),
      };
    }

    const reply = (result.text || parts.find((p) => p.text)?.text || "").trim();

    if (!reply) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Empty response from Gemini" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        type: "text",
        reply,
      }),
    };
  } catch (err) {
    console.error("Gemini Error:", err?.message || err);
    const msg = String(err?.message || err || "Unknown error");
    const isConfig = /API key|authentication|permission|quota|billing/i.test(msg);

    return {
      statusCode: isConfig ? 503 : 500,
      headers,
      body: JSON.stringify({
        error: isConfig ? "AI service configuration error" : "Internal server error",
        details: msg.slice(0, 200),
      }),
    };
  }
}
