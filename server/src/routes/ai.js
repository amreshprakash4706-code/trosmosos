import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config.js';
import { executeTool, getToolDeclarations } from '../services/tool-executor.js';
import { audit } from '../services/auth.service.js';
import rateLimit from 'express-rate-limit';

const router = Router();
router.use(requireAuth);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.aiRateLimitMax || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'AI rate limit exceeded', code: 'AI_RATE_LIMIT' },
});

const SYSTEM_INSTRUCTION = `You are Trosmos AI, the intelligent system copilot of Trosmos OS — a real multi-user web operating environment.

You help the user control their Trosmos session using the provided tools. Prefer taking action via tools over merely describing the action. After a tool runs, the result is returned so you can confirm success or report the real error.

Never invent private user data, fake system metrics, or claim an action succeeded when no tool was invoked. Stay in character as the OS copilot. Use light humor when it fits. If a capability is limited by the browser or server configuration, explain the limitation honestly.

Destructive or mutating actions (create, write, overwrite) will be held for user confirmation by the system. Do not claim they succeeded until a tool result confirms it. Respect user permissions. Never attempt to access another user's data.`;

router.post(
  '/chat',
  aiLimiter,
  asyncHandler(async (req, res) => {
    if (!config.aiEnabled || !config.geminiApiKey) {
      return res.status(503).json({
        error: 'AI service is not configured. Set GEMINI_API_KEY in the server environment.',
        code: 'AI_NOT_CONFIGURED',
      });
    }

    const { message, history = [], toolResults = [], confirmationId = null } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message required', code: 'VALIDATION' });
    }
    if (message.length > 16000) {
      return res.status(400).json({ error: 'message too long', code: 'VALIDATION' });
    }

    const correlationId = req.correlationId || null;

    // Direct confirmation of a pending mutating tool
    if (confirmationId) {
      // The client re-submits the same tool name via a special path; for simplicity
      // we accept confirmationId + optional toolName/args from body.
      const toolName = req.body.toolName;
      const args = req.body.args || {};
      if (!toolName) {
        return res.status(400).json({ error: 'toolName required when confirming', code: 'VALIDATION' });
      }
      const out = await executeTool(req.user.id, toolName, args, {
        confirmationId,
        correlationId,
        req,
      });
      return res.json({ type: 'tool_result', ...out });
    }

    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

    const contents = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-12)) {
        if (h.role && h.text) {
          contents.push({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(h.text).slice(0, 8000) }],
          });
        }
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    if (Array.isArray(toolResults) && toolResults.length > 0) {
      const summary = toolResults
        .map((t) => `Tool ${t.name}: ${t.ok ? JSON.stringify(t.result).slice(0, 2000) : 'Error: ' + t.error}`)
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
        tools: [{ functionDeclarations: getToolDeclarations() }],
      },
    });

    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length > 0) {
      const executed = [];
      const clientTools = [];
      const pendingConfirmations = [];

      for (const p of functionCalls) {
        const name = p.functionCall.name;
        const args = p.functionCall.args || {};
        const out = await executeTool(req.user.id, name, args, { correlationId, req });
        if (out.client) {
          clientTools.push({ name, args });
        } else if (out.type === 'confirmation_required') {
          pendingConfirmations.push(out);
        } else {
          executed.push({ name, ...out });
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
        confirmations: pendingConfirmations,
        reply: parts.find((p) => p.text)?.text || null,
      });
    }

    const reply = (result.text || parts.find((p) => p.text)?.text || '').trim();
    if (!reply) {
      return res.status(502).json({ error: 'Empty response from AI provider', code: 'AI_EMPTY' });
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
      version: config.version,
    });
  })
);

export default router;
