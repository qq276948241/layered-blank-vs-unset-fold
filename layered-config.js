'use strict';

class ConfigParseError extends Error {
  constructor(layerName, line, detail) {
    super(`配置解析错误：${layerName} 层第 ${line} 行：${detail}`);
    this.name = 'ConfigParseError';
    this.layer = layerName;
    this.line = line;
  }
}

class ConfigReferenceError extends Error {
  constructor(entry, refKey, chain) {
    const loop = [...chain, refKey].join(' -> ');
    super(
      `循环引用：${entry.layer} 层第 ${entry.line} 行的键 "${entry.key}" ` +
      `引用了 "${refKey}"，形成环：${loop}`
    );
    this.name = 'ConfigReferenceError';
    this.layer = entry.layer;
    this.line = entry.line;
    this.key = entry.key;
    this.refKey = refKey;
  }
}

class ConfigUnknownKeyError extends Error {
  constructor(entry, refKey) {
    super(
      `未定义的键：${entry.layer} 层第 ${entry.line} 行的键 "${entry.key}" ` +
      `引用了任何一层都没有写过的 "${refKey}"`
    );
    this.name = 'ConfigUnknownKeyError';
    this.layer = entry.layer;
    this.line = entry.line;
    this.key = entry.key;
    this.refKey = refKey;
  }
}

const REF_PATTERN = /\$\{([^{}]+)\}/g;

function parseLayer(name, text) {
  const entries = new Map();
  String(text).split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      throw new ConfigParseError(name, line, '缺少 "="，无法解析');
    }
    const key = raw.slice(0, eq).trim();
    if (key === '') {
      throw new ConfigParseError(name, line, '键名为空');
    }
    const value = raw.slice(eq + 1).trim();
    entries.set(key, { key, rawValue: value, layer: name, line });
  });
  return { name, entries };
}

// layerSpecs: [{ name, text }, ...]，按从低到高的优先级排列，
// 例如 [默认层, 环境层, 本次覆盖]。后面的层盖住前面的层。
function loadConfig(layerSpecs) {
  const layers = layerSpecs.map((spec) => parseLayer(spec.name, spec.text));

  // 读取半：定位某个键最终由哪一层提供原始条目。
  // 用 Map.has 判断"写没写过"，所以空字符串是已定义的值，不会落回更低的层。
  function readEntry(key) {
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      if (layers[i].entries.has(key)) {
        return layers[i].entries.get(key);
      }
    }
    return undefined;
  }

  // 读取半的出口：读出有效条目后，交给合并半展开其中的引用。
  function readValue(key, chain) {
    const entry = readEntry(key);
    if (entry === undefined) return undefined;
    return mergeEntry(entry, chain);
  }

  // 合并半：展开一个条目里的 ${ref}。每个引用都回到读取半取条目，
  // 再递归回这里展开；两半互相调用，链上检出环时在引用那一行报错。
  function mergeEntry(entry, chain) {
    const nextChain = [...chain, entry.key];
    return entry.rawValue.replace(REF_PATTERN, (whole, refKey) => {
      const refEntry = readEntry(refKey);
      if (refEntry === undefined) {
        throw new ConfigUnknownKeyError(entry, refKey);
      }
      if (nextChain.includes(refKey)) {
        throw new ConfigReferenceError(entry, refKey, nextChain);
      }
      return mergeEntry(refEntry, nextChain);
    });
  }

  return {
    layerNames: layers.map((layer) => layer.name),
    has(key) {
      return readEntry(key) !== undefined;
    },
    get(key) {
      return readValue(key, []);
    },
    toObject() {
      const out = {};
      for (const layer of layers) {
        for (const key of layer.entries.keys()) {
          if (!Object.prototype.hasOwnProperty.call(out, key)) {
            out[key] = readValue(key, []);
          }
        }
      }
      return out;
    },
  };
}

module.exports = {
  loadConfig,
  parseLayer,
  ConfigParseError,
  ConfigReferenceError,
  ConfigUnknownKeyError,
};
