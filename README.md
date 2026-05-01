# Design Inspector — Pixso Plugin (Шаг 1)

## Структура файлов

```
pixso-plugin/
├── manifest.json   — конфигурация плагина
├── sandbox.js      — логика обхода нод, сборка JSON
├── ui.html         — интерфейс с кнопкой «Проверить»
└── README.md       — этот файл
```

---

## Установка

### Вариант A — локальная разработка (Pixso Desktop)
1. Открыть Pixso Desktop
2. Главное меню → **Плагины** → **Разработка** → **Импортировать плагин из файла**
3. Выбрать файл `manifest.json` из этой папки
4. Плагин появится в меню: **Плагины** → **Design Inspector**

### Вариант B — через Pixso Web
В веб-версии локальные плагины работают аналогично:
Меню → Плагины → Разработка → Добавить локальный плагин → `manifest.json`

---

## Как пользоваться

1. Откройте дизайн-файл в Pixso
2. **Опционально:** выделите нужные объекты (фреймы, группы, компоненты)
3. Запустите плагин через меню Плагины → Design Inspector
4. Нажмите кнопку **«Проверить»**
5. Дождитесь завершения анализа
6. Нажмите **«Скопировать JSON в буфер»**

**Логика выбора нод:**
- Если что-то выделено → анализируется только выделение
- Если ничего не выделено → анализируются все фреймы верхнего уровня на текущей странице

---

## Структура JSON на выходе

```json
{
  "_meta": {
    "exportedAt": "2025-01-15T10:30:00.000Z",
    "pluginVersion": "1.0.0",
    "pixsoApiVersion": "...",
    "fileKey": "abc123",
    "pageName": "Main",
    "pageId": "0:1",
    "source": "selection | page",
    "nodeCount": 5
  },

  "localStyles": {
    "paint":  [ { "id": "...", "name": "Primary/Blue", "paints": [...] } ],
    "text":   [ { "id": "...", "name": "H1/Regular", "fontSize": 32, "fontName": {...} } ],
    "effect": [ { "id": "...", "name": "Shadow/Card", "effects": [...] } ],
    "grid":   [ { "id": "...", "name": "Layout/12col" } ]
  },

  "nodes": [
    {
      "id": "10:5",
      "name": "Card",
      "type": "FRAME",
      "visible": true,
      "locked": false,

      "position": {
        "x": 100,          "y": 200,
        "absoluteX": 100,  "absoluteY": 200
      },
      "size": { "width": 375, "height": 812 },

      "rotation": 0,
      "opacity": 1,
      "layerIndex": 2,
      "layerDepth": 0,
      "blendMode": "NORMAL",
      "isMask": false,

      "fills": [
        {
          "type": "SOLID",
          "opacity": 1,
          "visible": true,
          "color": { "r": 255, "g": 255, "b": 255, "a": 1, "hex": "#ffffff" }
        }
      ],

      "strokes": {
        "paints": [],
        "weight": 0,
        "align": "INSIDE",
        "dashPattern": []
      },

      "effects": [
        {
          "type": "DROP_SHADOW",
          "visible": true,
          "color": { "r": 0, "g": 0, "b": 0, "a": 0.15, "hex": "#000000" },
          "offset": { "x": 0, "y": 4 },
          "radius": 12,
          "spread": 0
        }
      ],

      "cornerRadius": 16,

      "constraints": {
        "horizontal": "STRETCH",
        "vertical": "TOP"
      },

      "autoLayout": {
        "mode": "VERTICAL",
        "paddingTop": 16, "paddingBottom": 16,
        "paddingLeft": 16, "paddingRight": 16,
        "itemSpacing": 12,
        "primaryAxisAlignItems": "MIN",
        "counterAxisAlignItems": "MIN"
      },

      "text": null,

      "component": null,

      "prototypeLinks": [
        {
          "trigger": { "type": "ON_CLICK", "delay": null, "keyCode": null },
          "action": { "type": "NODE" },
          "targetNodeId": "20:5",
          "targetNodeName": "Detail Screen",
          "transition": {
            "type": "SMART_ANIMATE",
            "duration": 300,
            "easing": "EASE_OUT"
          }
        }
      ],

      "styles": {
        "fill":   { "id": "S:abc", "name": "Background/White" },
        "effect": { "id": "S:def", "name": "Shadow/Card" }
      },

      "clipsContent": true,
      "layoutGrids": [],

      "children": [
        {
          "id": "10:6",
          "name": "Title",
          "type": "TEXT",
          "text": {
            "content": "Привет, мир",
            "fontSize": 24,
            "fontName": { "family": "Inter", "style": "Bold" },
            "textAlign": "LEFT",
            "textAlignVertical": "TOP",
            "letterSpacing": { "unit": "PERCENT", "value": -1 },
            "lineHeight": { "unit": "AUTO" },
            "textDecoration": "NONE",
            "textCase": "ORIGINAL",
            "styledSegments": null
          },
          "children": []
        }
      ]
    }
  ]
}
```

---

## Поле `prototypeLinks` — детали

Заполняется через `node.reactions` (Plugin API, без REST API).

| Поле | Описание |
|---|---|
| `trigger.type` | `ON_CLICK`, `ON_HOVER`, `ON_PRESS`, `MOUSE_ENTER`, `MOUSE_LEAVE`, `DELAY`, `KEY_DOWN` |
| `action.type` | `NODE` (переход к ноде), `URL` (внешняя ссылка), `BACK`, `CLOSE` |
| `targetNodeId` | ID целевой ноды (если action=NODE) |
| `targetNodeName` | Имя целевой ноды (резолвится через `pixso.getNodeById`) |
| `transition.type` | `DISSOLVE`, `SMART_ANIMATE`, `MOVE_IN`, `MOVE_OUT`, `PUSH`, `SLIDE_IN`, `SLIDE_OUT` |

---

## Совместимость

| Версия Pixso | Статус |
|---|---|
| 2.2.4 | ✅ Полная поддержка |
| 1.3.x | ✅ Поддержка (без `layoutWrap`, `counterAxisSpacing` если API < 1.0) |

Плагин совместим с Figma-плагинами (Pixso поддерживает импорт Figma-плагинов).

---

## Следующие шаги

- **Шаг 2:** Backend-сервер принимает этот JSON через `POST /save-json`
- **Шаг 3:** LLM-агент обрабатывает JSON через GigaChat
- **Шаг 4:** Ответ возвращается в плагин и показывается в модальном окне
