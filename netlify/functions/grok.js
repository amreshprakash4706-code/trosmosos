export async function handler(event) {
  // CORS for browser clients (Netlify Functions)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
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
        body: JSON.stringify({ error: "Invalid JSON body" })
      };
    }

    const { message, conversation = [] } = body;

    // Input validation
    if (typeof message !== "string" || !message.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Message is required and must be a non-empty string" })
      };
    }

    if (message.length > 2000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Message too long (max 2000 characters)" })
      };
    }

    if (!Array.isArray(conversation)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Conversation must be an array" })
      };
    }

    // Limit conversation history for safety / cost
    const safeConversation = conversation
      .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
      .slice(-12)
      .map((m) => ({
        role: m.role === "assistant" || m.role === "user" ? m.role : "user",
        content: String(m.content).slice(0, 1500)
      }));

    const messages = [
      {
        role: "system",
        content: "You are Trosmos AI, the premium intelligent copilot inside Trosmos OS — a beautiful AI-native operating system. Be helpful, concise, friendly, and witty. Answer questions naturally. The frontend handles direct OS actions (like opening apps or changing settings), so if the user asks for those you can playfully confirm or just respond helpfully."
      },
      ...safeConversation,
      { role: "user", content: message.trim() }
    ];

    if (!process.env.GROQ_API_KEY) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          error: "AI service not configured",
          details: "GROQ_API_KEY environment variable is missing"
        })
      };
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        stream: false,
        temperature: 0.7,
        max_tokens: 600
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: data.error?.message || "Upstream AI error",
          details: data
        })
      };
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Empty response from AI provider" })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply })
    };

  } catch (err) {
    console.error("AI function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        details: "Check that GROQ_API_KEY is set correctly in Netlify"
      })
    };
  }
}