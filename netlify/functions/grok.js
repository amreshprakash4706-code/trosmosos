export async function handler(event) {
  try {
    const { message, conversation = [] } = JSON.parse(event.body || '{}');

    const messages = [
      {
        role: "system",
        content: "You are Trosmos AI, the premium intelligent copilot inside Trosmos OS — a beautiful AI-native operating system. Be helpful, concise, friendly, and witty. Answer questions naturally. The frontend handles direct OS actions (like opening apps or changing settings), so if the user asks for those you can playfully confirm or just respond helpfully."
      },
      ...conversation
    ];

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "grok-4.3",
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
        body: JSON.stringify(data)
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reply: data.choices[0].message.content
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
}