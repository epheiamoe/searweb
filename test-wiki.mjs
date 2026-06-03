import { searchWikipedia } from './dist/search/wikipedia.js';

async function testWiki() {
  console.log('Testing search_wikipedia...');
  try {
    const results = await searchWikipedia('Model Context Protocol', 'en', 3);
    console.log('Success! Got', results.length, 'results');
    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error('Failed:', e);
  }
}

testWiki();
