import assert from 'node:assert/strict';
import { buildCandidates, classifyFailure, llm, providerHealth } from './src/index.js';

function makeKV() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.get(k) || null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function testGroqSuccess() {
  const oldFetch = globalThis.fetch;
  try {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      return response({ choices: [{ message: { content: 'ok from groq' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    };
    const env = { GROQ_API_KEY: 'test-groq', OPENAI_API_KEY: 'test-openai', PAID_LLM_MODE: 'off', KV: makeKV() };
    const out = await llm(env, [{ role: 'user', content: 'hi' }], 'fast');
    assert.equal(out.provider, 'groq');
    assert.equal(out.cost, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, 'openai/gpt-oss-20b');
  } finally { globalThis.fetch = oldFetch; }
}

async function testFreeFallbackToWorkersAI() {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => response({ error: { message: 'Rate limit exceeded' } }, 429, { 'retry-after': '60' });
    const env = {
      GROQ_API_KEY: 'test-groq',
      OPENAI_API_KEY: 'test-openai',
      PAID_LLM_MODE: 'off',
      KV: makeKV(),
      AI: { async run(model, payload) { assert.equal(model, '@cf/meta/llama-3.1-8b-instruct-fast'); return { response: 'ok from workers ai' }; } },
    };
    const out = await llm(env, [{ role: 'user', content: 'hi' }], 'fast');
    assert.equal(out.provider, 'workers_ai');
    assert.equal(out.cost, 0);
    const health = await providerHealth(env);
    assert.equal(health.paid_llm_mode, 'off');
    assert.ok(health.providers.some((p) => p.provider === 'openai_paid_emergency' && p.status === 'PAID_BLOCKED'));
  } finally { globalThis.fetch = oldFetch; }
}

async function testPaidEmergencyOnlyWhenEnabled() {
  const oldFetch = globalThis.fetch;
  try {
    const urls = [];
    globalThis.fetch = async (url, opts) => {
      urls.push(url);
      const body = JSON.parse(opts.body);
      if (url.includes('groq')) return response({ error: { message: 'provider overloaded' } }, 503);
      if (url.includes('openai.com')) {
        assert.equal(body.model, 'gpt-4o-mini');
        return response({ choices: [{ message: { content: 'paid emergency ok' } }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } });
      }
      throw new Error('unexpected url ' + url);
    };
    const env = { GROQ_API_KEY: 'test-groq', OPENAI_API_KEY: 'test-openai', PAID_LLM_MODE: 'emergency', KV: makeKV() };
    const out = await llm(env, [{ role: 'user', content: 'hi' }], 'fast');
    assert.equal(out.provider, 'openai_paid_emergency');
    assert.ok(out.cost > 0);
    assert.ok(urls.some((u) => u.includes('api.openai.com')));
  } finally { globalThis.fetch = oldFetch; }
}

async function testPaidBlockedFailure() {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => response({ error: { message: 'Rate limit exceeded' } }, 429);
    const env = { GROQ_API_KEY: 'test-groq', OPENAI_API_KEY: 'test-openai', PAID_LLM_MODE: 'off', KV: makeKV() };
    await assert.rejects(
      () => llm(env, [{ role: 'user', content: 'hi' }], 'fast'),
      /PAID_BLOCKED/
    );
  } finally { globalThis.fetch = oldFetch; }
}

function testClassification() {
  assert.equal(classifyFailure(429, '').state, 'RATE_LIMITED');
  assert.equal(classifyFailure(400, 'Model is unavailable').state, 'MODEL_UNAVAILABLE');
  assert.equal(classifyFailure(402, 'quota exhausted').state, 'QUOTA_EXHAUSTED');
  assert.equal(classifyFailure(401, '').state, 'AUTH_ERROR');
}

function testCandidateOrder() {
  const env = { GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o', PAID_LLM_MODE: 'off', AI: {} };
  const c = buildCandidates(env, 'fast');
  assert.deepEqual(c.map((x) => x.provider), ['groq', 'groq', 'workers_ai']);
  assert.ok(c.every((x) => x.costClass !== 'paid_emergency'));
}

await testGroqSuccess();
await testFreeFallbackToWorkersAI();
await testPaidEmergencyOnlyWhenEnabled();
await testPaidBlockedFailure();
testClassification();
testCandidateOrder();
console.log('worker provider router tests passed');
