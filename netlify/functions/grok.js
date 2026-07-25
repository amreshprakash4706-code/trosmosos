import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION = `You are Trosmos AI, the premium intelligent copilot inside Trosmos OS — a beautiful AI-native operating system designed from the ground up for the AI era.

Be helpful, concise, friendly, and witty. Prefer short, actionable answers over long essays.

You have deep awareness of the OS context (windows, files, settings, apps). The frontend already executes OS actions such as opening apps, creating files, or changing settings when the user issues clear commands. When users ask for those actions, respond naturally and confirm what was done without pretending to execute them yourself or inventing fake system state.

Never invent private user data. Stay in character as the OS copilot. Use light humor when appropriate.`;

export async function handler(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Method not allowed",
      }),
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
        body: JSON.stringify({
          error: "Invalid JSON body",
        }),
      };
    }

    const { message, conversation = [] } = body;

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
        body: JSON.stringify({
          error: "Message too long (max 2000 characters)",
        }),
      };
    }

    if (!Array.isArray(conversation)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Conversation must be an array",
        }),
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

    // Sanitize and keep only recent valid turns (history only — current message is separate)
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

    // Structured multi-turn contents (proper Gemini conversation history)
    const contents = [
      ...safeConversation,
      {
        role: "user",
        parts: [{ text: message.trim() }],
      },
    ];

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 600,
        topP: 0.95,
      },
    });

    const reply = (result.text || "").trim();

    if (!reply) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Empty response from Gemini",
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reply,
      }),
    };
  } catch (err) {
    console.error("Gemini Error:", err?.message || err);

    // Distinguish configuration / auth errors from transient ones
    const msg = String(err?.message || err || "Unknown error");
    const isConfig =
      /API key|authentication|permission|quota|billing/i.test(msg);

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
