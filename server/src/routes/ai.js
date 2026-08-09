import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config.js';
import * as vfs from '../services/vfs.service.js';
import { audit } from '../services/auth.service.js';

const router = Router();
router.use(requireAuth);

const SYSTEM_INSTRUCTION = `You are Trosmos AI, the intelligent system copilot of Trosmos OS — a real multi-user web operating environment.

You help the user control their Trosmos session using the provided tools. Prefer taking action via tools over merely describing the action. After a tool runs, the result is returned so you can confirm success or report the real error.

Never invent private user data, fake system metrics, or claim an action succeeded when no tool was invoked. Stay in character as the OS copilot. Use light humor when it fits. If a capability is limited by the browser or server configuration, explain the limitation honestly.

Destructive actions (delete, overwrite) should be confirmed carefully. Respect user permissions.`;

const TOOL_DECLARATIONS = [
  {
    name: 'open_app',
    description: 'Open or focus an application window',
    parameters: {
      type: 'OBJECT',
      properties: {
        app: {
          type: 'STRING',
          description:
            'ai | files | browser | settings | app-store | task-manager | terminal | calculator | notes | clock | clipboard | help',
        },
      },
      required: ['app'],
    },
  },
  {
    name: 'close_app',
    description: 'Close an application window',
    parameters: {
      type: 'OBJECT',
      properties: { app: { type: 'STRING' } },
      required: ['app'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and folders in a directory',
    parameters: {
      type: 'OBJECT',
      properties: { path: { type: 'STRING', description: 'e.g. /Home/Documents' } },
      required: ['path'],
    },
  },
  {
    name: 'create_folder',
    description: 'Create a new folder',
    parameters: {
      type: 'OBJECT',
      properties: {
        parent: { type: 'STRING' },
        name: { type: 'STRING' },
      },
      required: ['parent', 'name'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new text or markdown file',
    parameters: {
      type: 'OBJECT',
      properties: {
        parent: { type: 'STRING' },
        name: { type: 'STRING' },
        content: { type: 'STRING' },
      },
      required: ['parent', 'name'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'OBJECT',
      properties: { path: { type: 'STRING' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Overwrite content of an existing file',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING' },
        content: { type: 'STRING' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'search_files',
    description: 'Search files by name or path',
    parameters: {
      type: 'OBJECT',
      properties: { query: { type: 'STRING' } },
      required: ['query'],
    },
  },
  {
    name: 'get_storage_stats',
    description: 'Get current storage usage for the user',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_system_info',
    description: 'Get basic system information',
    parameters: { type: 'OBJECT', properties: {} },
  },
];

async function executeServerTool(userId, name, args) {
  try {
    switch (name) {
      case 'list_directory': {
        const items = vfs.listDirectory(userId, args.path || '/Home');
        return { ok: true, result: items };
      }
      case 'create_folder': {
        const node = vfs.createFolder(userId, args.parent || '/Home', args.name);
        return { ok: true, result: node };
      }
      case 'create_file': {
        const node = vfs.createFile(userId, args.parent || '/Home/Documents', args.name, args.content || '');
        return { ok: true, result: node };
      }
      case 'read_file': {
        const file = vfs.readFile(userId, args.path);
        return { ok: true, result: { path: file.path, content: file.content, size: file.size } };
      }
      case 'write_file': {
        const file = vfs.writeFile(userId, args.path, args.content || '');
        return { ok: true, result: { path: file.path, size: file.size } };
      }
      case 'search_files': {
        const results = vfs.searchFiles(userId, args.query || '');
        return { ok: true, result: results };
      }
      case 'get_storage_stats': {
        return { ok: true, result: vfs.getStorageStats(userId) };
      }
      case 'get_system_info': {
        return {
          ok: true,
          result: {
            name: config.name,
            version: config.version,
            aiEnabled: config.aiEnabled,
          },
        };
      }
      // Client-side only tools — return instruction for frontend
      case 'open_app':
      case 'close_app':
        return { ok: true, result: { clientAction: name, args }, client: true };
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e.message || 'Tool execution failed' };
  }
}

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    if (!config.aiEnabled || !config.geminiApiKey) {
      return res.status(503).json({
        error: 'AI service is not configured. Set GEMINI_API_KEY in the server environment.',
        code: 'AI_NOT_CONFIGURED',
      });
    }

    const { message, history = [], toolResults = [] } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message required' });
    }

    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

    const contents = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-12)) {
        if (h.role && h.text) {
          contents.push({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(h.text) }],
          });
        }
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    if (Array.isArray(toolResults) && toolResults.length > 0) {
      const summary = toolResults
        .map((t) => `Tool ${t.name}: ${t.ok ? JSON.stringify(t.result) : 'Error: ' + t.error}`)
        .join('\n');
      contents.push({
        role: 'user',
        parts: [{ text: `Tool execution results:\n${summary}\n\nPlease respond to the user based on these results.` }],
      });
    }

    const result = await ai.models.generateContent({
      model: config.aiModel,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 800,
        topP: 0.95,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      },
    });

    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length > 0) {
      // Execute server-side tools immediately where possible
      const executed = [];
      const clientTools = [];

      for (const p of functionCalls) {
        const name = p.functionCall.name;
        const args = p.functionCall.args || {};
        if (['open_app', 'close_app'].includes(name)) {
          clientTools.push({ name, args });
        } else {
          const out = await executeServerTool(req.user.id, name, args);
          executed.push({ name, ...out });
          audit(req.user.id, 'ai.tool', name, null, { args, ok: out.ok }, req);
        }
      }

      return res.json({
        type: 'tool_calls',
        toolCalls: functionCalls.map((p) => ({
          name: p.functionCall.name,
          args: p.functionCall.args || {},
        })),
        serverResults: executed,
        clientTools,
        reply: parts.find((p) => p.text)?.text || null,
      });
    }

    const reply = (result.text || parts.find((p) => p.text)?.text || '').trim();
    if (!reply) {
      return res.status(502).json({ error: 'Empty response from AI provider' });
    }

    res.json({ type: 'text', reply });
  })
);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json({
      enabled: config.aiEnabled,
      model: config.aiEnabled ? config.aiModel : null,
      provider: 'gemini',
    });
  })
);

export default router;
