const test = require('node:test');
const assert = require('node:assert/strict');

const { __test: { postChatCompletion } } = require('../lib/deepseek');

function config(baseUrl, extra = {}) {
  return {
    provider: 'opencode', providerType: 'openai_compatible', providerTitle: 'OpenCode',
    apiKey: 'k', baseUrl, model: 'deepseek-v4.1-flash', temperature: 0.7, maxTokens: 100, ...extra,
  };
}

async function headersFor(cfg, messages) {
  const realFetch = global.fetch;
  let seen = null;
  global.fetch = async (_url, init) => {
    seen = init.headers;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  };
  try {
    await postChatCompletion(cfg, { messages });
  } finally {
    global.fetch = realFetch;
  }
  return seen;
}

const opening = [{ role: 'system', content: 'article' }, { role: 'user', content: 'q1' }];

test('OpenCode requests carry an honest user agent and a session header', async () => {
  const headers = await headersFor(config('https://opencode.ai/inference/go/openai/v1'), opening);
  assert.equal(headers['User-Agent'], 'zonglan-news/1.0');
  assert.match(headers['x-opencode-session'], /^zonglan-[0-9a-f]{32}$/);
});

test('session stays stable across follow-ups and differs between conversations', async () => {
  const cfg = config('https://opencode.ai/inference/go/openai/v1');
  const first = await headersFor(cfg, opening);
  const followUp = await headersFor(cfg, [...opening, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }]);
  const other = await headersFor(cfg, [{ role: 'system', content: 'another article' }, { role: 'user', content: 'q1' }]);
  assert.equal(followUp['x-opencode-session'], first['x-opencode-session']);
  assert.notEqual(other['x-opencode-session'], first['x-opencode-session']);
});

test('the session never reveals the API key or message text', async () => {
  const headers = await headersFor(config('https://opencode.ai/inference/go/openai/v1', { apiKey: 'sk-secret' }), opening);
  assert.equal(headers['x-opencode-session'].includes('sk-secret'), false);
  assert.equal(headers['x-opencode-session'].includes('article'), false);
});

test('other providers get no OpenCode headers, including lookalike hosts', async () => {
  for (const baseUrl of ['https://api.deepseek.com/v1', 'https://opencode.ai.evil.example/v1', 'https://notopencode.ai/v1']) {
    const headers = await headersFor(config(baseUrl), opening);
    assert.equal('x-opencode-session' in headers, false, baseUrl);
    assert.equal('User-Agent' in headers, false, baseUrl);
  }
});
