/**
 * lib/agent.js — LLM-агент (универсальная обёртка)
 *
 * СМЕНА АГЕНТА: достаточно заменить одну строку в самом конце файла:
 *   module.exports = { ask: askStub };     ← сейчас активна заглушка
 *   module.exports = { ask: askGigaChat }; ← раскомментировать для GigaChat
 *
 * Интерфейс функции ask():
 *   @param  {string} jsonString — JSON макета из плагина
 *   @returns {Promise<string>}  — текстовый ответ агента
 */

// ══════════════════════════════════════════════════════════════════════════════
// ЗАГЛУШКА (активна по умолчанию)
// Считает символы и описывает структуру без вызова внешнего LLM
// ══════════════════════════════════════════════════════════════════════════════

async function askStub(jsonString) {
  const charCount = jsonString.length;

  let parsed = null;
  let nodeCount = '?';
  let pageName = '?';

  try {
    parsed = JSON.parse(jsonString);
    pageName  = parsed._meta?.pageName  || '—';
    nodeCount = parsed.nodes?.length    || 0;
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
// ГИГАЧАТ
// Раскомментировать и заполнить GIGACHAT_CLIENT_ID + GIGACHAT_CLIENT_SECRET
// в переменных окружения Vercel (Settings → Environment Variables)
// ══════════════════════════════════════════════════════════════════════════════

/*
const https = require('https');

async function getGigaChatToken() {
  // OAuth2: получаем Bearer-токен по client_id + client_secret
  // Документация: https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-token
  const credentials = Buffer.from(
    process.env.GIGACHAT_CLIENT_ID + ':' + process.env.GIGACHAT_CLIENT_SECRET
  ).toString('base64');

  const res = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Accept':        'application/json',
      'Authorization': 'Basic ' + credentials,
      'RqUID':         crypto.randomUUID(),
    },
    body: 'scope=GIGACHAT_API_PERS',
    // GigaChat использует российский TLS — в prod нужен CA Сбера
    // Для тестов можно отключить проверку (небезопасно для прода):
    // agent: new https.Agent({ rejectUnauthorized: false }),
  });

  if (!res.ok) throw new Error('GigaChat OAuth failed: ' + res.status);
  const data = await res.json();
  return data.access_token;
}

async function askGigaChat(jsonString) {
  const token = await getGigaChatToken();

  // Обрезаем JSON до 4000 символов для тестового промта
  const truncated = jsonString.length > 4000
    ? jsonString.slice(0, 4000) + '\n... [обрезано]'
    : jsonString;

  const prompt = `Посчитай символы в следующем JSON, скажи их количество и опиши что это:\n\n${truncated}`;

  const res = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({
      model:       'GigaChat',
      max_tokens:  512,
      temperature: 0.3,
      messages: [
        { role: 'user', content: prompt }
      ],
    }),
    // agent: new https.Agent({ rejectUnauthorized: false }), // только для теста
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('GigaChat API error ' + res.status + ': ' + err);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(пустой ответ)';
}
*/

// ══════════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ — меняйте только эту строку при смене агента
// ══════════════════════════════════════════════════════════════════════════════

module.exports = { ask: askStub };
// module.exports = { ask: askGigaChat }; // ← GigaChat
