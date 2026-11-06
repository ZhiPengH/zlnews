const test = require('node:test');
const assert = require('node:assert/strict');

const prompts = require('../lib/rewrite-prompts');

test('the original preset keeps its old keys so existing rewrites stay fresh', () => {
  assert.equal(prompts.resolveRewritePrompt('default', { mode: 'preset' }).key, 'qiaomu-rewrite-link-preservation-v1');
  assert.equal(prompts.resolveRewritePrompt('paper', {}).key, 'qiaomu-paper-interpretation-v1');
  assert.equal(prompts.resolveRewritePrompt('producthunt', null).key, 'qiaomu-producthunt-official-site-rewrite-v1');
  assert.equal(prompts.resolveRewritePrompt('hackernews', undefined).key, 'qiaomu-hackernews-discussion-rewrite-v1');
  assert.match(prompts.resolveRewritePrompt('hackernews', {}).prompt, /Hacker News 改写补充要求/);
  assert.equal(prompts.PRESETS[0].id, 'original');
});

test('a custom prompt replaces the style and keeps material-specific rules', () => {
  const setting = { mode: 'custom', custom: '用冷静的新闻编辑口吻改写。' };
  const plain = prompts.resolveRewritePrompt('default', setting);
  assert.equal(plain.prompt, '用冷静的新闻编辑口吻改写。');
  assert.match(plain.key, /^custom-default-[0-9a-f]{12}$/);
  assert.equal(plain.prompt.includes('向阳乔木'), false);
  assert.match(prompts.resolveRewritePrompt('hackernews', setting).prompt, /^用冷静的新闻编辑口吻改写。[\s\S]*Hacker News 改写补充要求/);
  assert.match(prompts.resolveRewritePrompt('paper', setting).prompt, /论文解读补充要求/);
  assert.notEqual(plain.key, prompts.resolveRewritePrompt('default', { mode: 'custom', custom: '另一种' }).key);
});

test('settings are validated and normalized', () => {
  assert.deepEqual(prompts.validateSetting({ mode: 'custom', custom: '  x  ' }), { mode: 'custom', custom: 'x' });
  assert.deepEqual(prompts.validateSetting({ mode: 'preset', custom: '保留草稿' }), { mode: 'preset', custom: '保留草稿' });
  assert.throws(() => prompts.validateSetting({ mode: 'custom', custom: ' ' }), /请填写/);
  assert.throws(() => prompts.validateSetting({ mode: 'other' }), /模式无效/);
  assert.throws(() => prompts.validateSetting('x'), /格式无效/);
  assert.throws(() => prompts.validateSetting({ mode: 'custom', custom: 'a'.repeat(8001) }), /8000/);
  assert.deepEqual(prompts.normalizeSetting({ mode: 'weird', custom: 3 }), { mode: 'preset', custom: '3' });
});
