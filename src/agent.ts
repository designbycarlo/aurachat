import { ToolLoopAgent, tool, isStepCount } from 'ai';
import { deepSeek } from '@ai-sdk/deepseek';
import { z } from 'zod';

/**
 * Resolve the language model to use.
 * Uses DeepSeek (reads DEEPSEEK_API_KEY from environment automatically).
 */
function resolveModel() {
  return deepSeek('deepseek-chat');
}

/**
 * AuraChat Agent - A versatile AI assistant built with the Vercel AI SDK.
 * Uses ToolLoopAgent for multi-step tool calling in a loop.
 */
export const auraChatAgent = new ToolLoopAgent({
  id: 'aurachat',
  model: resolveModel(),
  instructions: `You are AuraChat, a helpful and versatile AI assistant.

Your capabilities:
1. You can check the weather for any location
2. You can perform calculations and conversions
3. You can search for information (simulated)
4. You can provide helpful, concise responses

When responding:
- Be friendly and professional
- Provide accurate information
- Use tools when necessary to answer questions
- Explain your reasoning when using tools
- Keep responses concise but complete`,
  tools: {
    /**
     * Weather tool - Get current weather for a location
     */
    getWeather: tool({
      description: 'Get the current weather in a location (returns temperature in Fahrenheit)',
      inputSchema: z.object({
        location: z.string().describe('The city and state/country, e.g. "San Francisco, CA" or "London, UK"'),
      }),
      execute: async ({ location }) => {
        // Simulate weather API call
        const temperature = Math.round(Math.random() * (95 - 30) + 30);
        const conditions = ['Sunny', 'Cloudy', 'Partly Cloudy', 'Rainy', 'Clear', 'Windy'];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];
        const humidity = Math.round(Math.random() * (90 - 30) + 30);

        return {
          location,
          temperature,
          condition,
          humidity,
          unit: 'Fahrenheit',
        };
      },
    }),

    /**
     * Calculator tool - Perform mathematical operations
     */
    calculate: tool({
      description: 'Perform mathematical calculations and conversions',
      inputSchema: z.object({
        expression: z.string().describe('The mathematical expression to evaluate, e.g. "2 + 2" or "convert 100 USD to EUR"'),
        type: z.enum(['math', 'conversion']).describe('The type of calculation'),
      }),
      execute: async ({ expression, type }) => {
        if (type === 'math') {
          try {
            // Safe evaluation of basic math expressions
            // Using Function constructor for simple arithmetic only
            const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
            const result = new Function(`return (${sanitized})`)();
            return {
              expression,
              result,
              type: 'math',
            };
          } catch {
            return {
              expression,
              error: 'Could not evaluate expression',
              type: 'math',
            };
          }
        }

        return {
          expression,
          result: 'Conversion result placeholder',
          type: 'conversion',
        };
      },
    }),

    /**
     * Current time tool - Get current date and time
     */
    getCurrentTime: tool({
      description: 'Get the current date and time for a specified timezone or location',
      inputSchema: z.object({
        timezone: z.string().optional().describe('The timezone, e.g. "America/New_York", "Asia/Tokyo", "Europe/London"'),
      }),
      execute: async ({ timezone }) => {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: timezone || 'UTC',
          timeZoneName: 'short',
        };

        const formatted = new Intl.DateTimeFormat('en-US', options).format(now);
        return {
          datetime: formatted,
          timezone: timezone || 'UTC',
          timestamp: now.toISOString(),
        };
      },
    }),
  },
  stopWhen: isStepCount(10),
  onStepEnd: async ({ stepNumber, toolResults, finishReason }) => {
    if (toolResults?.length) {
      console.log(`\n  [Step ${stepNumber}] Tools used: ${toolResults.map((r: { toolName?: string }) => r.toolName).join(', ')}`);
    }
  },
});