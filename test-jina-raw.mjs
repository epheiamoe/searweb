async function testJinaRaw() {
  console.log('Testing jina.ai raw response...');
  try {
    const response = await fetch('https://r.jina.ai/http://html.duckduckgo.com/html/?q=mcp+server');
    const text = await response.text();
    
    // Try to parse as JSON
    try {
      const json = JSON.parse(text);
      console.log('JSON keys:', Object.keys(json));
      console.log('Content type:', typeof json.content);
      console.log('Content:', json.content);
      console.log('Text type:', typeof json.text);
      console.log('Text:', json.text);
      console.log('Data type:', typeof json.data);
      console.log('Data:', json.data);
    } catch {
      console.log('Not JSON, plain text');
      console.log('First 500 chars:', text.slice(0, 500));
    }
  } catch (e) {
    console.error('Failed:', e);
  }
}

testJinaRaw();
