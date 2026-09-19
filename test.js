
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFromTexts,
  createMerger,
  parseLayer,
} = require('./src/index');
const { ConfigReferenceError, ConfigSyntaxError } = require('./src/errors');

const DEFAULT_NAME = '默认层';
const ENV_NAME = '环境层';
const OVERRIDE_NAME = '覆盖层';

function merge(texts, files = []) {
  return buildFromTexts(texts, files);
}

function layer(name, index, text, file = 't.conf') {
  return parseLayer({ layerName: name, layerIndex: index, text, file });
}

test('三层叠合: 覆盖层 > 环境层 > 默认层', () => {
  const config = merge([
    'host=a\nport=1\nonlyDefault=keep',
    'host=b\nport=2',
    'port=3',
  ]);

  assert.equal(config.resolve('host'), 'b');
  assert.equal(config.resolve('port'), '3');
  assert.equal(config.resolve('onlyDefault'), 'keep');
});

test('显式空串是赋值: 压掉下层的非空值', () => {
  const config = merge([
    'greeting=hi',
    'greeting=',
    '',
  ]);

  assert.equal(config.has('greeting'), true);
  assert.equal(config.resolve('greeting'), '');
});

test('空串参与引用时解析为空，不报错、不穿透', () => {
  const config = merge([
    'prefix=hello\nsuffix=!\nblank=',
    '',
    'message=${prefix}${blank}${suffix}',
  ]);

  assert.equal(config.resolve('message'), 'hello!');
});

test('没写过的键: 直接取值要报错，不当成空串', () => {
  const config = merge(['a=1', '', '']);
  assert.equal(config.has('missing'), false);
  assert.throws(
    () => config.resolve('missing'),
    /在三层里都没有写过/);
});

test('引用没写过的键: 在引用那一行报出来', () => {
  const config = merge([
    'a=x',
    '',
    'b=pre-${ghost}-post',
  ], ['d.conf', 'e.conf', 'o.conf']);

  try {
    config.resolve('b');
    assert.fail('应当抛出引用错误');
  } catch (error) {
    assert.ok(error instanceof ConfigReferenceError);
    assert.equal(error.site.layerName, OVERRIDE_NAME);
    assert.equal(error.site.line, 1);
    assert.equal(error.site.column, 'b=pre-'.length + 1);
    assert.match(error.message, /不存在的键 "ghost"/);
    assert.match(error.message, /o\.conf:1:\d+/);
  }
});

test('自引用: 在引用那一行报错，不用空值顶上', () => {
  const config = merge(['x=${x}', '', '']);

  try {
    config.resolve('x');
    assert.fail('应当抛出循环错误');
  } catch (error) {
    assert.ok(error instanceof ConfigReferenceError);
    assert.equal(error.site.line, 1);
    assert.equal(error.site.layerName, DEFAULT_NAME);
    assert.match(error.message, /x -> x/);
  }
});

test('绕回更早的层: 报在环境层的引用行，链是 a -> b -> a', () => {
  const config = merge([
    'a=${b}',
    'b=${a}',
    'ok=fine',
  ], ['default.conf', 'env.conf', 'override.conf']);

  try {
    config.resolve('a');
    assert.fail('应当抛出循环错误');
  } catch (error) {
    assert.ok(error instanceof ConfigReferenceError);
    assert.equal(error.site.layerName, ENV_NAME);
    assert.equal(error.site.line, 1);
    assert.match(error.message, /a -> b -> a/);
  }
});

test('同层两个键互相指: 也是循环，报在引用行', () => {
  const config = merge(['p=${q}', 'q=${p}', '']);
  try {
    config.resolve('p');
    assert.fail('应当抛出循环错误');
  } catch (error) {
    assert.ok(error instanceof ConfigReferenceError);
    assert.equal(error.site.layerName, ENV_NAME);
    assert.equal(error.site.line, 1);
    assert.equal(error.site.column, 3);
    assert.match(error.message, /p -> q -> p/);
  }
});

test('绕回更早的层(高层 -> 低层 -> 高层): 报在低层那条回边行', () => {
  const config = merge([
    'base=${over}',
    '',
    'over=${base}-x',
  ], ['default.conf', 'env.conf', 'override.conf']);

  try {
    config.resolve('over');
    assert.fail('应当抛出循环错误');
  } catch (error) {
    assert.ok(error instanceof ConfigReferenceError);
    assert.equal(error.site.layerName, DEFAULT_NAME);
    assert.equal(error.site.line, 1);
    assert.match(error.message, /over -> base -> over/);
  }
});

test('绕回链: 始终报在真正合上环的那条引用行', () => {
  const config = merge([
    '',
    'env_key=${top}',
    'top=${env_key}',
  ], ['default.conf', 'env.conf', 'override.conf']);

  try {
    config.resolve('env_key');
    assert.fail('应当抛出循环错误');
  } catch (error) {
    assert.ok(error instanceof ConfigReferenceError);
    assert.equal(error.site.layerName, OVERRIDE_NAME);
    assert.equal(error.site.line, 1);
    assert.match(error.message, /env_key -> top -> env_key/);
  }
});

test('引用始终看最终层叠值: 指向被高层覆盖的键', () => {
  const config = merge([
    'host=0.0.0.0\nport=8080\nurl=${host}:${port}',
    'host=127.0.0.1',
    'port=443',
  ]);

  assert.equal(config.resolve('url'), '127.0.0.1:443');
});

test('跨层引用: 高层引用低层的独立键是正常的', () => {
  const config = merge([
    'base=root',
    'child=${base}/env',
    'leaf=${child}/over',
  ]);
  assert.equal(config.resolve('leaf'), 'root/env/over');
});

test('resolveAll: 空串保留，缺失键不在结果里', () => {
  const config = merge([
    'a=1\nb=2',
    'b=',
    'c=${a}',
  ]);

  assert.deepEqual(config.all(), { a: '1', b: '', c: '1' });
});

test('读取一截: parseLayer 保留行号和列号', () => {
  const parsed = layer(DEFAULT_NAME, 0, 'host = abc\nport = ${x}', 'd.conf');
  assert.equal(parsed.records.get('host').line, 1);
  assert.equal(parsed.records.get('port').line, 2);
  assert.equal(parsed.records.get('port').column, 'port = '.length);
});

test('读取一截: 注释和空行不算写过', () => {
  const parsed = layer(DEFAULT_NAME, 0, '# 注释\n\n; 另一种注释\nk=v');
  assert.deepEqual([...parsed.records.keys()], ['k']);
});

test('读取一截: 同一层重复写键直接报语法错', () => {
  assert.throws(
    () => layer(DEFAULT_NAME, 0, 'a=1\na=2'),
    (error) => error instanceof ConfigSyntaxError && error.site.line === 2);
});

test('读取一截: 缺等号 / 引用不闭合 都带行列', () => {
  assert.throws(
    () => layer(ENV_NAME, 1, 'garbage-line'),
    (error) => error instanceof ConfigSyntaxError && error.site.line === 1);
  assert.throws(
    () => layer(OVERRIDE_NAME, 2, 'a=${b'),
    (error) => error instanceof ConfigSyntaxError && /没有闭合/.test(error.message));
});

test('两截互相调用: 只改读取侧解析也会作用到合并结果', () => {
  const config = merge(['word=Hi', '', 'repeat=${word}${word}']);
  assert.equal(config.resolve('repeat'), 'HiHi');

  const standalone = createMerger([
    layer(DEFAULT_NAME, 0, 'word=Hi'),
    layer(OVERRIDE_NAME, 2, 'repeat=${word}${word}'),
  ]);
  assert.equal(standalone.resolve('repeat'), 'HiHi');
});
