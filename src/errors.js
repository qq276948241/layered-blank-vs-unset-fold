
function siteText(site) {
  if (!site) {
    return '';
  }
  return `[${site.layerName}] ${site.file || '<inline>'}:${site.line}:${site.column}`;
}

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

class ConfigSyntaxError extends ConfigError {
  constructor(site, message) {
    super(`${siteText(site)} 语法错误: ${message}`);
    this.name = 'ConfigSyntaxError';
    this.site = site;
  }
}

class ConfigReferenceError extends ConfigError {
  constructor(site, message) {
    super(`${siteText(site)} ${message}`);
    this.name = 'ConfigReferenceError';
    this.site = site;
  }
}

function cycleError(site, stack, repeatFrame) {
  const start = stack.findIndex((frame) =>
    frame.layerIndex === repeatFrame.layerIndex
    && frame.key === repeatFrame.key);
  const chain = stack
    .slice(start)
    .map((frame) => frame.key)
    .concat(repeatFrame.key)
    .join(' -> ');
  return new ConfigReferenceError(
    site,
    `循环引用: ${chain}`);
}

function missingError(site, key) {
  return new ConfigReferenceError(
    site,
    `引用了不存在的键 "${key}"，不用空值顶替`);
}

module.exports = {
  ConfigError,
  ConfigSyntaxError,
  ConfigReferenceError,
  cycleError,
  missingError,
};
