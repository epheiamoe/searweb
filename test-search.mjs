import { searchDDG } from './dist/search/ddg.js';

async function testSearch() {
  console.log('Testing search_web_ddg...');
  try {
    const results = await searchDDG('mcp server', 3);
    console.log('Success! Got', results.length, 'results');
    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error('Failed:', e);
  }
}

testSearch();
