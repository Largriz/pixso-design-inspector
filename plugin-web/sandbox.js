// sandbox.js v2.0 — оптимизирован под оценку манипуляций и полноты информирования
// Структура JSON соответствует требованиям 22-МР и Правилам экранных форм ЦБ РФ
// Доступ: только Pixso Plugin API. Браузерные API (fetch, clipboard) — только в ui.html

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function rgbToHex(r, g, b) {
  var h = function(v) { return Math.round(v * 255).toString(16).padStart(2, '0'); };
  return '#' + h(r) + h(g) + h(b);
}

/**
 * Первый видимый SOLID-цвет из fills.
 * Для градиента — первый стоп. IMAGE — флаг '__image__'.
 */
function extractColor(fills) {
  if (!fills || fills === pixso.mixed) return null;
  for (var i = 0; i < fills.length; i++) {
    var f = fills[i];
    if (f.visible === false) continue;
    if (f.type === 'SOLID' && f.color) {
      return rgbToHex(f.color.r || 0, f.color.g || 0, f.color.b || 0);
    }
    if (f.type === 'IMAGE') return '__image__';
    if (f.gradientStops && f.gradientStops.length > 0) {
      var s = f.gradientStops[0];
      return rgbToHex(s.color.r || 0, s.color.g || 0, s.color.b || 0);
    }
  }
  return null;
}

/**
 * Цвет фона — поднимаемся вверх по дереву родителей.
 * Нужен для проверки контрастности (22-МР, ГОСТ Р 52872-2019).
 */
function extractBgColor(node) {
  var current = node.parent;
  while (current) {
    try {
      if (current.fills && current.fills !== pixso.mixed && current.fills.length > 0) {
        var color = extractColor(current.fills);
        if (color && color !== '__image__') return color;
      }
    } catch (e) {}
    current = current.parent;
  }
  return null;
}

/**
 * Абсолютные координаты ноды на холсте.
 */
function getAbsPos(node) {
  try {
    var ab = node.absoluteBoundingBox;
    if (ab) return { x: Math.round(ab.x), y: Math.round(ab.y) };
  } catch (e) {}
  return { x: Math.round(node.x || 0), y: Math.round(node.y || 0) };
}

/**
 * Порядок ноды в стеке среди сиблингов.
 */
function getLayerIndex(node) {
  try {
    if (node.parent && node.parent.children) {
      return node.parent.children.indexOf(node);
    }
  } catch (e) {}
  return 0;
}

// ─── Сериализаторы ────────────────────────────────────────────────────────────

/**
 * Текст — только поля значимые для оценки манипуляций.
 * Убраны: letterSpacing, lineHeight, textAlignVertical, paragraphSpacing, paragraphIndent
 */
function serializeText(node) {
  if (node.type !== 'TEXT') return null;

  var mix = pixso.mixed;

  var result = {
    content:        node.characters || '',
    fontSize:       node.fontSize === mix       ? 'MIXED' : (node.fontSize || null),
    fontStyle:      node.fontName === mix        ? 'MIXED' : (node.fontName && node.fontName.style || null),
    textCase:       node.textCase === mix        ? 'MIXED' : (node.textCase || 'ORIGINAL'),
    textDecoration: node.textDecoration === mix  ? 'MIXED' : (node.textDecoration || 'NONE'),
    textAlign:      node.textAlignHorizontal || 'LEFT',
    mixedStyles:    false
  };

  // Сегменты — только если форматирование неоднородное (22-МР: сравнение шрифта условий и согласия)
  try {
    var segs = node.getStyledTextSegments(['fontSize', 'fontName', 'fills', 'textDecoration', 'textCase']);
    if (segs && segs.length > 1) {
      result.mixedStyles = true;
      result.segments = segs.map(function(seg) {
        var segColor = extractColor(seg.fills);
        var s = {
          text:      node.characters.slice(seg.start, seg.end),
          fontSize:  seg.fontSize,
          fontStyle: seg.fontName && seg.fontName.style || null
        };
        if (segColor) s.color = segColor;
        if (seg.textDecoration && seg.textDecoration !== 'NONE') s.textDecoration = seg.textDecoration;
        if (seg.textCase && seg.textCase !== 'ORIGINAL') s.textCase = seg.textCase;
        return s;
      });
    }
  } catch (e) {}

  return result;
}

/**
 * Прототипные переходы — только смысловые поля.
 * Убраны: transition (анимации), trigger.delay, trigger.keyCode, targetNodeId
 */
function serializeLinks(node) {
  var links = [];
  try {
    var reactions = node.reactions;
    if (!reactions || reactions.length === 0) return links;

    for (var i = 0; i < reactions.length; i++) {
      var reaction = reactions[i];
      var link = {};

      if (reaction.trigger) {
        link.trigger = reaction.trigger.type || null;
        // DELAY-триггер сам по себе сигнал скрытого автоперехода — тип достаточен
      }

      if (reaction.action) {
        link.action = reaction.action.type || null;

        if (reaction.action.type === 'NODE' && reaction.action.destinationId) {
          try {
            var target = pixso.getNodeById(reaction.action.destinationId);
            if (target) link.target = target.name;
          } catch (e) {}
        }

        if (reaction.action.type === 'URL') {
          link.url = reaction.action.url || null;
        }
      }

      if (link.trigger || link.action) links.push(link);
    }
  } catch (e) {}

  return links;
}

/**
 * Имя компонента-оригинала для INSTANCE.
 * Ключевой детектор: «Button/Ghost» vs «Button/Primary», «Checkbox/Checked» vs «/Unchecked»
 */
function getComponentName(node) {
  if (node.type !== 'INSTANCE') return null;
  try {
    var main = node.mainComponent;
    if (main) return main.name;
  } catch (e) {}
  return null;
}

/**
 * Привязанные стили — только text и fill, только name.
 * «Caption/Muted», «Disclaimer/Small» — роль элемента через название.
 */
function getStyleNames(node) {
  var names = {};
  try {
    if (node.textStyleId && node.textStyleId !== pixso.mixed) {
      var ts = pixso.getStyleById(node.textStyleId);
      if (ts) names.text = ts.name;
    }
    if (node.fillStyleId && node.fillStyleId !== pixso.mixed) {
      var fs = pixso.getStyleById(node.fillStyleId);
      if (fs) names.fill = fs.name;
    }
  } catch (e) {}
  return Object.keys(names).length > 0 ? names : null;
}

/**
 * Авто-лейаут — только direction и spacing.
 * Убраны: paddings, alignments, wrap, sizing modes
 */
function getAutoLayout(node) {
  if (!node.layoutMode || node.layoutMode === 'NONE') return null;
  return {
    mode:        node.layoutMode,
    itemSpacing: node.itemSpacing || 0
  };
}

// ─── Основная сериализация ────────────────────────────────────────────────────

/**
 * Сериализует ноду в финальный формат.
 * Итого 22 смысловых поля — сфокусированы на детектировании манипуляций по 22-МР.
 */
function serializeNode(node, depth) {
  depth = depth || 0;

  var pos          = getAbsPos(node);
  var fills        = (node.fills === pixso.mixed) ? [] : (node.fills || []);
  var color        = extractColor(fills);
  var bgColor      = extractBgColor(node);
  var links        = serializeLinks(node);
  var text         = serializeText(node);
  var autoLayout   = getAutoLayout(node);
  var componentName = getComponentName(node);
  var styleNames   = getStyleNames(node);

  var result = {
    // ── Идентификация ──────────────────────────────────────────────────────
    id:   node.id,
    name: node.name,   // семантика дизайнера: «Disclaimer», «CTA», «Checkbox», «Fine Print»
    type: node.type,   // TEXT, FRAME, INSTANCE, RECTANGLE, GROUP, VECTOR, ELLIPSE...

    // ── Видимость — сигналы скрытого контента ──────────────────────────────
    visible: node.visible !== false,  // false = элемент скрыт от пользователя
    opacity: node.opacity !== undefined ? node.opacity : 1,  // < 0.3 = фактически нечитаем

    // ── Цвет и контраст (22-МР, ГОСТ Р 52872-2019) ─────────────────────────
    color:   color,     // цвет самого элемента: hex, '__image__', или null
    bgColor: bgColor,   // цвет фона ближайшего родителя (для расчёта контраста)

    // ── Размер — маленький = нечитаем или кликабельная ловушка ─────────────
    size: {
      w: Math.round(node.width  || 0),
      h: Math.round(node.height || 0)
    },

    // ── Текст (только для TEXT-нод) ────────────────────────────────────────
    text: text,

    // ── Переходы (без анимаций) ─────────────────────────────────────────────
    // trigger: ON_CLICK / ON_HOVER / DELAY — тип сам по себе сигнал
    // action:  NODE / URL / BACK / CLOSE
    // target:  имя экрана («Условия», «Договор», «Подробнее»)
    // url:     внешняя ссылка
    links: links.length > 0 ? links : null,

    // ── Роль в системе ─────────────────────────────────────────────────────
    // componentName: «Button/Ghost» vs «Button/Primary» — асимметрия согласия/отказа
    //                «Checkbox/Checked» — предотмеченный чекбокс (нарушение 22-МР)
    componentName: componentName,
    isInstance:    node.type === 'INSTANCE' ? true : null,
    styleNames:    styleNames,

    // ── Положение — пространственный контекст ──────────────────────────────
    position:   pos,              // абсолютные координаты на холсте
    layerDepth: depth,            // высокий + name=«modal» = модальное окно
    layerIndex: getLayerIndex(node), // порядок в стеке среди сиблингов

    // ── Авто-лейаут ─────────────────────────────────────────────────────────
    autoLayout: autoLayout,

    // ── Дочерние ноды (рекурсивно) ──────────────────────────────────────────
    children: []
  };

  // Рекурсивный обход детей
  if (node.children && node.children.length > 0) {
    result.children = node.children.map(function(child) {
      return serializeNode(child, depth + 1);
    });
  }

  // Убираем null-поля чтобы не раздувать JSON
  // children не трогаем — пустой массив нужен (показывает что это листовой узел)
  Object.keys(result).forEach(function(k) {
    if (k !== 'children' && (result[k] === null || result[k] === undefined)) {
      delete result[k];
    }
  });

  return result;
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

pixso.showUI(__html__, {
  title: 'Design Inspector Web',
  width: 360,
  height: 280,
  enableResize: true,
  minWidth: 300,
  minHeight: 220
});

pixso.ui.onmessage = function(msg) {

  // ── Сбор JSON ─────────────────────────────────────────────────────────────
  if (msg.type === 'START_INSPECT') {

    pixso.ui.postMessage({ type: 'STATUS', text: 'Анализирую...' });

    try {
      var page = pixso.currentPage;
      var targetNodes = [];
      var source = '';

      // Приоритет: выделение → все фреймы верхнего уровня
      var selection = pixso.currentPage.selection;
      if (selection && selection.length > 0) {
        targetNodes = Array.from(selection);
        source = 'selection';
      } else {
        targetNodes = page.children.filter(function(n) {
          return n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET';
        });
        source = 'page';
      }

      if (targetNodes.length === 0) {
        pixso.ui.postMessage({
          type: 'ERROR',
          text: 'Нет нод для анализа. Выделите объекты или убедитесь, что на странице есть фреймы.'
        });
        return;
      }

      pixso.ui.postMessage({
        type: 'STATUS',
        text: 'Сериализую ' + targetNodes.length + ' нод(ы)...'
      });

      var output = {
        _meta: {
          pageName:   page.name,
          source:     source,
          exportedAt: new Date().toISOString(),
          nodeCount:  targetNodes.length
        },
        nodes: targetNodes.map(function(n) { return serializeNode(n, 0); })
      };

      var jsonString = JSON.stringify(output, null, 2);

      pixso.ui.postMessage({
        type:      'JSON_READY',
        json:      jsonString,
        nodeCount: targetNodes.length,
        source:    source
      });

    } catch (err) {
      pixso.ui.postMessage({
        type: 'ERROR',
        text: 'Ошибка при сборе данных: ' + (err.message || String(err))
      });
    }
  }

  // ── Закрытие ──────────────────────────────────────────────────────────────
  if (msg.type === 'CLOSE') {
    pixso.closePlugin();
  }
};
