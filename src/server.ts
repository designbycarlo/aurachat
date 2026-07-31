import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createAgentUIStreamResponse } from 'ai';
import { auraChatAgent } from './agent.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static('public'));

/**
 * Converts a simple {role, content} message to the AI SDK UI message format
 * which requires id, role, and parts array.
 */
function toUIMessage(msg: { role?: string; content?: string; id?: string }) {
  return {
    id: msg.id || crypto.randomUUID(),
    role: msg.role || 'user',
    parts: [{ type: 'text' as const, text: msg.content || '' }],
  };
}

/**
 * POST /api/chat
 * Streams agent responses using Server-Sent Events (SSE).
 * Accepts messages in simple {role, content} format or full UI message format.
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Convert simple {role, content} messages to UI message format if needed
    const uiMessages = messages.map((msg: { role?: string; content?: string; id?: string; parts?: unknown[] }) => {
      // If already has parts, it's already in UI format
      if (msg.parts) return msg;
      // Otherwise convert from simple format
      return toUIMessage(msg);
    });

    // Use the AI SDK's built-in UI stream response
    const response = await createAgentUIStreamResponse({
      agent: auraChatAgent,
      uiMessages,
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });

    // Forward the streaming response to the client
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error('Chat API error:', error);
    // Only send JSON error if headers haven't been sent yet (SSE not started)
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n  🚀 AuraChat Server running at http://localhost:${PORT}`);
  console.log(`  📡 API endpoint: http://localhost:${PORT}/api/chat\n`);
});
