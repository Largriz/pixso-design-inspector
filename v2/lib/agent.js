/**
 * lib/agent.js — LLM-агент (универсальная обёртка)
 *
 * Экспортирует:
 *   ask(jsonString: string) => Promise<string>
 *
 * По умолчанию включена заглушка. Если заданы переменные окружения GigaChat —
 * используем реальный вызов GigaChat на сервере (ключи на сервере, не в плагине).
 */
 
// ══════════════════════════════════════════════════════════════════════════════
// ЗАГЛУШКА (активна по умолчанию)
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
// GIGACHAT (опционально)
// Нужны env:
//   GIGACHAT_CLIENT_ID
//   GIGACHAT_CLIENT_SECRET
// Дополнительно (только для тестов / self-signed CA):
//   GIGACHAT_INSECURE_TLS=true
// ══════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const https = require('https');
 
let cachedToken = null;
let cachedTokenExpiresAtMs = 0;
 
function buildHttpsAgent() {
  if (String(process.env.GIGACHAT_INSECURE_TLS || '').toLowerCase() === 'true') {
    return new https.Agent({ rejectUnauthorized: false });
  }
  return undefined;
}
 
async function getGigaChatToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAtMs - now > 15_000) {
    return cachedToken;
  }
 
  const clientId = process.env.GIGACHAT_CLIENT_ID;
  const clientSecret = process.env.GIGACHAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing GIGACHAT_CLIENT_ID / GIGACHAT_CLIENT_SECRET');
  }
 
  const credentials = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const agent = buildHttpsAgent();
 
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
 
  try {
    const res = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': 'Basic ' + credentials,
        'RqUID': crypto.randomUUID(),
      },
      body: 'scope=GIGACHAT_API_PERS',
      ...(agent ? { agent } : {}),
      signal: controller.signal,
    });
 
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error('GigaChat OAuth failed: ' + res.status + (err ? ' ' + err : ''));
    }
 
    const data = await res.json();
    cachedToken = data.access_token;
 
    const expiresInSec = Number(data.expires_in || 0);
    cachedTokenExpiresAtMs = Date.now() + (expiresInSec > 0 ? expiresInSec * 1000 : 60_000);
 
    return cachedToken;
  } finally {
    clearTimeout(timeout);
  }
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
 
  const agent = buildHttpsAgent();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
 
  try {
    const res = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({
        model: 'GigaChat',
        max_tokens: 800,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
      ...(agent ? { agent } : {}),
      signal: controller.signal,
    });
 
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error('GigaChat API error ' + res.status + ': ' + err);
    }
 
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '(пустой ответ)';
  } finally {
    clearTimeout(timeout);
  }
}
 
// ══════════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ — меняйте только эту строку при смене агента
// ══════════════════════════════════════════════════════════════════════════════
 
function hasGigaChatEnv() {
  return Boolean(process.env.GIGACHAT_CLIENT_ID && process.env.GIGACHAT_CLIENT_SECRET);
}

module.exports = {
  ask: async (jsonString) => {
    if (!hasGigaChatEnv()) return await askStub(jsonString);
    return await askGigaChat(jsonString);
  },
};

