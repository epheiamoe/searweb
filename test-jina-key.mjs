import { JinaClient } from './dist/jina/client.js';

async function testJinaWithKey() {
  console.log('Testing jina client with API key...');
  
  // Set a test key
  process.env.JINA_API_KEYS = 'jina_894f582b7d6a430d9cb6886037d54b2c-1n5oPxJOcwZP6TZ1hFGzb2-UC-H';
  
  const jina = new JinaClient();
  try {
    const result = await jina.fetch('https://html.duckduckgo.com/html/?q=mcp+server');
    console.log('Content type:', typeof result.content);
    console.log('Content is array?', Array.isArray(result.content));
    console.log('Content length:', result.content?.length || 0);
    
    if (typeof result.content === 'string') {
      console.log('First 500 chars:', result.content.slice(0, 500));
    } else {
      console.log('Content:', JSON.stringify(result.content, null, 2));
    }
  } catch (e) {
    console.error('Failed:', e);
  }
}

testJinaWithKey();
