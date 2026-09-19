
const {
  ConfigError,
  cycleError,
  missingError,
} = require('./errors');
const { createReader } = require('./read');

function createMerger(layers) {
  const ordered = [...layers].sort(
    (left, right) => right.layerIndex - left.layerIndex);

  function findHighest(key) {
    for (const layer of ordered) {
      if (layer.records.has(key)) {
        return layer.records.get(key);
      }
    }
    return null;
  }

  const reader = createReader({
    resolveRef: ({ key, site, stack }) => resolve(key, site, stack),
  });

  function resolve(key, atSite = null, stack = []) {
    const record = findHighest(key);

    if (!record) {
      if (atSite) {
        throw missingError(atSite, key);
      }
      throw new ConfigError(`键 "${key}" 在三层里都没有写过`);
    }

    const frame = {
      key,
      layerName: record.layerName,
      layerIndex: record.layerIndex,
      file: record.file,
      line: record.line,
    };

    const repeated = stack.find(
      (item) => item.layerIndex === frame.layerIndex && item.key === frame.key);
    if (repeated) {
      const errorSite = atSite ? { ...atSite, key } : frame;
      throw cycleError(errorSite, stack, frame);
    }

    return reader.readValue(record, stack.concat(frame));
  }

  function has(key) {
    return findHighest(key) !== null;
  }

  function resolveAll() {
    const result = {};
    for (const layer of ordered) {
      for (const key of layer.records.keys()) {
        if (!Object.prototype.hasOwnProperty.call(result, key)) {
          result[key] = resolve(key);
        }
      }
    }
    return result;
  }

  return { resolve, has, resolveAll, all: resolveAll };
}

module.exports = {
  ConfigError,
  createMerger,
};
