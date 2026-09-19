
const {
  ConfigError,
  ConfigSyntaxError,
} = require('./errors');

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function parseLayer({ text, layerName, layerIndex, file = null }) {
  const records = new Map();
  const lines = String(text).split(/\r?\n/);

  lines.forEach((rawLine, lineIndex) => {
    const line = lineIndex + 1;
    const stripped = rawLine.trim();

    if (stripped === '' || stripped.startsWith('#') || stripped.startsWith(';')) {
      return;
    }

    const equalAt = rawLine.indexOf('=');
    if (equalAt === -1) {
      throw new ConfigSyntaxError(
        { layerName, layerIndex, file, line, column: 1, key: null },
        `无法识别的一行 "${stripped}"，需要写成 key=value`);
    }

    const key = rawLine.slice(0, equalAt).trim();
    if (!KEY_PATTERN.test(key)) {
      throw new ConfigSyntaxError(
        {
          layerName,
          layerIndex,
          file,
          line,
          column: rawLine.indexOf(key) + 1 || 1,
          key: null,
        },
        `键 "${key}" 不合法，只允许字母、数字、下划线、点和中划线，且以字母或下划线开头`);
    }

    if (records.has(key)) {
      throw new ConfigSyntaxError(
        { layerName, layerIndex, file, line, column: 1, key },
        `键 "${key}" 在这一层写了两次`);
    }

    const value = rawLine.slice(equalAt + 1);
    const site = {
      layerName,
      layerIndex,
      file,
      line,
      column: equalAt + 2,
      key,
    };
    records.set(key, {
      key,
      value,
      tokens: tokenize(site, value),
      ...site,
    });
  });

  return { layerName, layerIndex, file, records };
}

function tokenize(baseSite, value) {
  const tokens = [];
  let cursor = 0;

  const pushLiteral = (text) => {
    if (text === '') {
      return;
    }
    const last = tokens[tokens.length - 1];
    if (last && last.type === 'literal') {
      last.text += text;
    } else {
      tokens.push({ type: 'literal', text });
    }
  };

  while (cursor < value.length) {
    const openAt = value.indexOf('${', cursor);
    if (openAt === -1) {
      pushLiteral(value.slice(cursor));
      break;
    }

    if (openAt > cursor) {
      pushLiteral(value.slice(cursor, openAt));
    }

    const closeAt = value.indexOf('}', openAt + 2);
    const nestedAt = value.indexOf('${', openAt + 2);
    const refColumn = baseSite.column + openAt;

    if (closeAt === -1) {
      throw new ConfigSyntaxError(
        { ...baseSite, column: refColumn },
        '引用没有闭合的 "}"');
    }
    if (nestedAt !== -1 && nestedAt < closeAt) {
      throw new ConfigSyntaxError(
        { ...baseSite, column: baseSite.column + nestedAt },
        '引用的键名里不允许再嵌套 "${"');
    }

    const refName = value.slice(openAt + 2, closeAt).trim();
    if (refName === '') {
      throw new ConfigSyntaxError(
        { ...baseSite, column: refColumn },
        '空引用 "${}"，必须给出键名');
    }
    if (!KEY_PATTERN.test(refName)) {
      throw new ConfigSyntaxError(
        { ...baseSite, column: refColumn },
        `引用的键名 "${refName}" 不合法`);
    }

    tokens.push({ type: 'ref', key: refName, column: refColumn });
    cursor = closeAt + 1;
  }

  return tokens;
}

function createReader({ resolveRef }) {
  if (typeof resolveRef !== 'function') {
    throw new TypeError('createReader 需要注入 merge 一侧的 resolveRef');
  }

  return {
    parseLayer,

    readValue(record, stack) {
      const site = {
        layerName: record.layerName,
        layerIndex: record.layerIndex,
        file: record.file,
        line: record.line,
        column: record.column,
        key: record.key,
      };

      let resolved = '';
      for (const token of record.tokens) {
        if (token.type === 'literal') {
          resolved += token.text;
        } else {
          resolved += String(resolveRef({
            key: token.key,
            site: { ...site, column: token.column },
            stack,
          }));
        }
      }
      return resolved;
    },
  };
}

module.exports = {
  ConfigError,
  parseLayer,
  tokenize,
  createReader,
};
