import { JinaClient } from './dist/jina/client.js';

async function testJina() {
  console.log('Testing jina client directly...');
  const jina = new JinaClient();
  try {
    const result = await jina.fetch('https://html.duckduckgo.com/html/?q=mcp+server');
    console.log('Content type:', typeof result.content);
    console.log('Content length:', result.content?.length || 0);
    console.log('First 1000 chars:');
    console.log(result.content?.slice(0, 1000));
  } catch (e) {
    console.error('Failed:', e);
  }
}

testJina();
