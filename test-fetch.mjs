import { fetchWebMarkdown } from './dist/tools/fetch.js';

async function testFetch() {
  console.log('Testing fetch_web_markdown...');
  try {
    const result = await fetchWebMarkdown('https://github.com/modelcontextprotocol/servers', {
      withIndex: false
    });
    console.log('Success! Content length:', result.content.length);
    console.log('Source:', result.source);
    console.log('First 500 chars:');
    console.log(result.content.slice(0, 500));
  } catch (e) {
    console.error('Failed:', e);
  }
}

testFetch();
