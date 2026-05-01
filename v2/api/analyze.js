/**
 * api/analyze.js — POST /api/analyze
 *
 * Принимает JSON от плагина Pixso, передаёт в LLM-агент,
 * сохраняет ответ в /tmp/{id}.json, возвращает URL результата.
 *
 * CORS обязателен — ui.html плагина работает в iframe с null origin.
 */
 
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const agent = require('../lib/agent');
 
const LOG_DIR = '/tmp/pixso-logs';
 
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
 
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
 
async function readBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
 
  let body = '';
  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', resolve);
    req.on('error', reject);
  });
  return body;
}
 
module.exports = async function handler(req, res) {
  setCorsHeaders(res);
 
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  try {
    const body = await readBody(req);
    if (!body || body.length < 2) return res.status(400).json({ error: 'Empty body' });
 
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
 
    const agentResponse = await agent.ask(body);
 
    const id = crypto.randomUUID();
    const record = {
      id,
      createdAt: new Date().toISOString(),
      pageName: parsed?._meta?.pageName || null,
      source: parsed?._meta?.source || null,
      charCount: body.length,
      nodeCount: parsed?._meta?.nodeCount ?? parsed?.nodes?.length ?? null,
      agentResponse,
      // В продакшне лучше НЕ сохранять весь inputJson (может быть большим/чувствительным).
      inputJson: parsed,
    };
 
    ensureLogDir();
    const filePath = path.join(LOG_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
 
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const resultUrl = `${protocol}://${host}/api/result/${id}`;
 
    return res.status(200).json({
      ok: true,
      id,
      resultUrl,
      charCount: body.length,
      agentResponse,
    });
  } catch (err) {
    console.error('[analyze] error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err?.message || String(err) });
  }
};

