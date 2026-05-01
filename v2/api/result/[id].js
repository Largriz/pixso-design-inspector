/**
 * api/result/[id].js — GET /api/result/:id
 *
 * Возвращает сохранённый ответ LLM по ID.
 * Поддерживает JSON (для плагина) и HTML (для браузера).
 */
 
const fs = require('fs');
const path = require('path');
 
const LOG_DIR = '/tmp/pixso-logs';
 
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
 
function buildHtmlPage(record) {
  const date = new Date(record.createdAt).toLocaleString('ru-RU');
  const escape = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
 
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ответ агента — ${escape(record.pageName || record.id)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0f0f0f; color: #e8e8e8; min-height: 100vh; padding: 32px 16px; }
  .card { max-width: 720px; margin: 0 auto; background: #1a1a1a;
          border: 1px solid #2e2e2e; border-radius: 12px; overflow: hidden; }
  .header { padding: 20px 24px; border-bottom: 1px solid #2e2e2e; }
  .header h1 { font-size: 16px; font-weight: 600; color: #fff; }
  .header p  { font-size: 12px; color: #888; margin-top: 4px; }
  .meta { display: flex; gap: 0; flex-wrap: wrap; border-bottom: 1px solid #2e2e2e; }
  .meta-item { flex: 1 1 160px; padding: 12px 24px; border-right: 1px solid #2e2e2e; }
  .meta-item:last-child { border-right: none; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #666; }
  .meta-value { font-size: 18px; font-weight: 600; color: #fff; margin-top: 3px; }
  .meta-value.sm { font-size: 13px; margin-top: 5px; }
  .body { padding: 24px; }
  .body h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .5px;
              color: #666; margin-bottom: 12px; }
  .response { background: #111; border: 1px solid #2e2e2e; border-radius: 8px;
               padding: 16px 20px; font-size: 14px; line-height: 1.7;
               color: #c8e6c9; white-space: pre-wrap; word-break: break-word; }
  .id-row { padding: 12px 24px; border-top: 1px solid #2e2e2e;
             font-size: 11px; color: #555; font-family: monospace; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>Ответ LLM-агента</h1>
    <p>Дизайн-инспектор · ${escape(date)}</p>
  </div>
  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Страница</div>
      <div class="meta-value sm">${escape(record.pageName || '—')}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Символов</div>
      <div class="meta-value">${Number(record.charCount || 0).toLocaleString('ru-RU')}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Нод</div>
      <div class="meta-value">${record.nodeCount ?? '—'}</div>
    </div>
  </div>
  <div class="body">
    <h2>Ответ агента</h2>
    <div class="response">${escape(record.agentResponse)}</div>
  </div>
  <div class="id-row">ID: ${escape(record.id)}</div>
</div>
</body>
</html>`;
}
 
module.exports = async function handler(req, res) {
  setCorsHeaders(res);
 
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
 
  const { id } = req.query;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) return res.status(400).json({ error: 'Invalid id format' });
 
  const filePath = path.join(LOG_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'Result not found',
      hint: 'Vercel /tmp сбрасывается при cold start. Если сервер перезапускался — результат не сохранился.',
    });
  }
 
  let record;
  try {
    record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return res.status(500).json({ error: 'Failed to read result' });
  }
 
  const acceptHtml = (req.headers['accept'] || '').includes('text/html');
  if (acceptHtml) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(buildHtmlPage(record));
  }
 
  return res.status(200).json({
    id: record.id,
    createdAt: record.createdAt,
    pageName: record.pageName,
    charCount: record.charCount,
    nodeCount: record.nodeCount,
    agentResponse: record.agentResponse,
  });
};

