import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

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

    // Keep only recent conversation
    const safeConversation = conversation
      .filter(
        (m) =>
          m &&
          typeof m.role === "string" &&
          typeof m.content === "string"
      )
      .slice(-12);

    // Gemini prompt
    const prompt = `
You are Trosmos AI, the premium intelligent copilot inside Trosmos OS — a beautiful AI-native operating system.

Be helpful, concise, friendly, and witty.

The frontend handles OS actions like opening apps and changing settings. If users ask for those actions, respond naturally without pretending to execute them.

Conversation:

${safeConversation
  .map(
    (m) =>
      `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`
  )
  .join("\n")}

User: ${message}

Assistant:
`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 600,
      },
    });

    const reply = result.text?.trim();

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
    console.error("Gemini Error:", err);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        details: err.message,
      }),
    };
  }
}