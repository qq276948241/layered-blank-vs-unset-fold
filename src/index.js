
const fs = require('node:fs');
const { parseLayer } = require('./read');
const { createMerger } = require('./merge');

const LAYER_SPECS = [
  { layerIndex: 0, layerName: '默认层' },
  { layerIndex: 1, layerName: '环境层' },
  { layerIndex: 2, layerName: '覆盖层' },
];

function loadLayers(paths) {
  return LAYER_SPECS.map((spec) => {
    const path = paths[spec.layerIndex];
    if (!path) {
      throw new TypeError(`缺少 ${spec.layerName} 的配置路径`);
    }
    const text = fs.readFileSync(path, 'utf8');
    return parseLayer({ ...spec, file: path, text });
  });
}

function buildFromTexts(texts, files = []) {
  const layers = LAYER_SPECS.map((spec) =>
    parseLayer({
      ...spec,
      file: files[spec.layerIndex] || null,
      text: texts[spec.layerIndex],
    }));
  return createMerger(layers);
}

function loadConfig(paths) {
  const merger = createMerger(loadLayers(paths));
  return {
    resolve: (key) => merger.resolve(key),
    has: (key) => merger.has(key),
    all: () => merger.resolveAll(),
  };
}

module.exports = {
  LAYER_SPECS,
  parseLayer,
  createMerger,
  loadLayers,
  buildFromTexts,
  loadConfig,
};
