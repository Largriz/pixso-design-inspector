/**
 * lib/agent.js — LLM-агент (универсальная обёртка)
 *
 * Экспортирует:
 *   ask(jsonString: string) => Promise<string>
 *
 * Поведение:
 * - Если заданы GIGACHAT_CLIENT_ID и GIGACHAT_CLIENT_SECRET — вызываем GigaChat на сервере.
 * - Иначе — безопасная заглушка (для локальной разработки без ключей).
 *
 * Важно: ключи должны быть только в переменных окружения Vercel, не в плагине.
 */
 
const crypto = require('crypto');
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');
 
// ══════════════════════════════════════════════════════════════════════════════
// ЗАГЛУШКА
// ══════════════════════════════════════════════════════════════════════════════
 
async function askStub(jsonString) {
  const charCount = jsonString.length;
 
  let nodeCount = '?';
  let pageName = '?';
 
  try {
    const parsed = JSON.parse(jsonString);
    pageName = parsed?._meta?.pageName || '—';
    nodeCount = parsed?.nodes?.length || 0;
  } catch (_) {}
 
  return [
    `Количество символов в JSON: ${charCount.toLocaleString('ru-RU')}.`,
    '',
    `Это JSON-структура дизайн-макета из Pixso.`,
    `Страница: «${pageName}».`,
    `Корневых нод: ${nodeCount}.`,
    '',
    `Структура содержит поля для анализа манипуляций: видимость элементов,`,
    `цвета и контрастность, размеры, текстовое содержимое, прототипные переходы`,
    `и компонентные связи. Формат соответствует требованиям 22-МР ЦБ РФ.`,
  ].join('\n');
}
 
// ══════════════════════════════════════════════════════════════════════════════
// GIGACHAT
// Env:
//   GIGACHAT_CLIENT_ID
//   GIGACHAT_CLIENT_SECRET
//
// Опционально (только для диагностики TLS; небезопасно для прода):
//   GIGACHAT_INSECURE_TLS=true
//
// Корпоративный контур (если нужен прокси):
//   HTTPS_PROXY / HTTP_PROXY
// ══════════════════════════════════════════════════════════════════════════════
 
function hasGigaChatEnv() {
  return Boolean(process.env.GIGACHAT_CLIENT_ID && process.env.GIGACHAT_CLIENT_SECRET);
}
 
function buildHttpsAgent() {
  if (String(process.env.GIGACHAT_INSECURE_TLS || '').toLowerCase() === 'true') {
    return new https.Agent({ rejectUnauthorized: false, keepAlive: true });
  }
  return new https.Agent({ keepAlive: true });
}
 
function maybeDecompress(buffer, encoding) {
  const enc = String(encoding || '').toLowerCase();
  if (enc.includes('br')) return zlib.brotliDecompressSync(buffer);
  if (enc.includes('gzip')) return zlib.gunzipSync(buffer);
  if (enc.includes('deflate')) return zlib.inflateSync(buffer);
  return buffer;
}
 
function httpsRequestJson({ method, url, headers, body }) {
  const u = new URL(url);
  const agent = buildHttpsAgent();
 
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        agent,
        headers: {
          'User-Agent': 'pixso-design-inspector/1.0',
          'Connection': 'keep-alive',
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks);
            const buf = maybeDecompress(raw, res.headers['content-encoding']);
            const text = buf.toString('utf8');
 
            const status = res.statusCode || 0;
            const contentType = String(res.headers['content-type'] || '');
 
            let json = null;
            if (contentType.includes('application/json')) {
              json = JSON.parse(text);
            } else {
              // иногда JSON приходит без корректного content-type
              try { json = JSON.parse(text); } catch (_) {}
            }
 
            resolve({ status, headers: res.headers, text, json });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
 
    req.on('error', reject);
    req.setTimeout(25_000, () => {
      req.destroy(new Error('Request timeout'));
    });
 
    if (body) req.write(body);
    req.end();
  });
}
 
let cachedToken = null;
let cachedTokenExpiresAtMs = 0;
 
async function getGigaChatToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAtMs - now > 15_000) return cachedToken;
 
  const clientId = process.env.GIGACHAT_CLIENT_ID;
  const clientSecret = process.env.GIGACHAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing GIGACHAT_CLIENT_ID / GIGACHAT_CLIENT_SECRET');
  }
 
  const credentials = Buffer.from(clientId + ':' + clientSecret).toString('base64');
 
  const { status, text, json } = await httpsRequestJson({
    method: 'POST',
    url: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': 'Basic ' + credentials,
      'RqUID': crypto.randomUUID(),
      'Accept-Encoding': 'gzip, deflate, br',
    },
    body: 'scope=GIGACHAT_API_PERS',
  });
 
  if (!json || status < 200 || status >= 300) {
    throw new Error('GigaChat OAuth failed: ' + status + ' ' + (text || '').slice(0, 500));
  }
 
  cachedToken = json.access_token;
  const expiresInSec = Number(json.expires_in || 0);
  cachedTokenExpiresAtMs = Date.now() + (expiresInSec > 0 ? expiresInSec * 1000 : 60_000);
  return cachedToken;
}
 
async function askGigaChat(jsonString) {
  const token = await getGigaChatToken();
 
  const truncated = jsonString.length > 40_000
    ? jsonString.slice(0, 40_000) + '\n... [обрезано]'
    : jsonString;
 
  const prompt = [
    'Ты — ассистент, который анализирует JSON дизайн-макета из Pixso.',
    'На входе структура: _meta и дерево nodes.',
    '',
    'Задача:',
    '- Кратко (до 15 пунктов) опиши, что находится в макете.',
    '- Найди потенциальные проблемы UX/манипуляции (скрытый текст, низкая читаемость, мелкие элементы, неочевидные ссылки).',
    '- Выдай итог в формате: "Краткое описание", "Риски", "Рекомендации".',
    '',
    'JSON:',
    truncated,
  ].join('\n');
 
  const payload = JSON.stringify({
    model: 'GigaChat',
    max_tokens: 800,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });
 
  const { status, text, json } = await httpsRequestJson({
    method: 'POST',
    url: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + token,
      'Accept-Encoding': 'gzip, deflate, br',
    },
    body: payload,
  });
 
  if (!json || status < 200 || status >= 300) {
    throw new Error('GigaChat API error ' + status + ': ' + (text || '').slice(0, 800));
  }
 
  return json.choices?.[0]?.message?.content || '(пустой ответ)';
}
 
module.exports = {
  ask: async (jsonString) => {
    if (!hasGigaChatEnv()) return await askStub(jsonString);
    try {
      return await askGigaChat(jsonString);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      // Добавляем подсказку для самой частой причины на Vercel
      const hint =
        'Если ошибка про certificate/TLS/UNABLE_TO_VERIFY_LEAF_SIGNATURE — нужен корпоративный CA ' +
        'или временная диагностика через GIGACHAT_INSECURE_TLS=true (только для теста).';
      throw new Error(msg + '\n' + hint);
    }
  },
};

