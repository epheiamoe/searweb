async function testJinaJSON() {
  console.log('Testing jina.ai JSON structure with key...');
  
  try {
    const response = await fetch('https://r.jina.ai/http://html.duckduckgo.com/html/?q=mcp+server', {
      headers: {
        'Authorization': 'Bearer jina_894f582b7d6a430d9cb6886037d54b2c-1n5oPxJOcwZP6TZ1hFGzb2-UC-H',
        'Accept': 'application/json'
      }
    });
    
    const text = await response.text();
    console.log('Response length:', text.length);
    
    try {
      const json = JSON.parse(text);
      console.log('JSON structure:');
      console.log(JSON.stringify(json, null, 2).slice(0, 2000));
    } catch {
      console.log('Not JSON:', text.slice(0, 500));
    }
  } catch (e) {
    console.error('Failed:', e);
  }
}

testJinaJSON();
