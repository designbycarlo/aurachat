import 'dotenv/config';
import { auraChatAgent } from './agent.js';
import * as readline from 'node:readline/promises';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║           🤖 AuraChat AI Agent              ║');
  console.log('║   Powered by OpenRouter (free models)       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('Available commands:');
  console.log('  /exit    - Exit the application');
  console.log('  /clear   - Clear the conversation');
  console.log('');
  console.log('Ask me about weather, calculations, time, or anything else!');
  console.log('');

  while (true) {
    const userInput = await terminal.question('You: ');

    if (userInput.toLowerCase() === '/exit') {
      console.log('\nGoodbye! 👋');
      terminal.close();
      process.exit(0);
    }

    if (userInput.toLowerCase() === '/clear') {
      console.clear();
      console.log('Conversation cleared.\n');
      continue;
    }

    if (!userInput.trim()) {
      continue;
    }

    console.log('');

    try {
      // Stream the agent's response
      const result = await auraChatAgent.stream({
        prompt: userInput,
      });

      process.stdout.write('AuraChat: ');
      let fullResponse = '';

      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        process.stdout.write(chunk);
      }

      console.log('\n');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'An unexpected error occurred');
      console.log('');
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  terminal.close();
  process.exit(1);
});