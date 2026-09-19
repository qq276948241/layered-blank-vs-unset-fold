'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadConfig,
  ConfigParseError,
  ConfigReferenceError,
  ConfigUnknownKeyError,
} = require('./layered-config');

test('三层叠加：后面的层盖住前面的层', () => {
  const config = loadConfig([
    { name: 'default', text: 'a = 1\nb = 1\nc = 1' },
    { name: 'env', text: 'b = 2\nc = 2' },
    { name: 'override', text: 'c = 3' },
  ]);
  assert.equal(config.get('a'), '1');
  assert.equal(config.get('b'), '2');
  assert.equal(config.get('c'), '3');
  assert.deepEqual(config.toObject(), { a: '1', b: '2', c: '3' });
});

test('空字符串是写过的值，不等于没写过', () => {
  const config = loadConfig([
    { name: 'default', text: 'greeting = hello\nonly-default = x' },
    { name: 'env', text: '' },
    { name: 'override', text: 'greeting =' },
  ]);
  assert.equal(config.get('greeting'), '');
  assert.equal(config.has('greeting'), true);
  assert.equal(config.get('only-default'), 'x');
  assert.equal(config.get('never-written'), undefined);
  assert.equal(config.has('never-written'), false);
});

test('引用可以跨层展开，且按合并后的视图取值', () => {
  const config = loadConfig([
    { name: 'default', text: 'base = /srv\ndir = ${base}/app' },
    { name: 'env', text: 'base = /opt' },
    { name: 'override', text: '' },
  ]);
  assert.equal(config.get('dir'), '/opt/app');
});

test('一层指到自己：在引用那一行报错', () => {
  const config = loadConfig([
    { name: 'default', text: 'a = 1' },
    { name: 'env', text: 'x = 0\ny = ${y}' },
    { name: 'override', text: '' },
  ]);
  assert.throws(
    () => config.get('y'),
    (err) => {
      assert.ok(err instanceof ConfigReferenceError);
      assert.equal(err.layer, 'env');
      assert.equal(err.line, 2);
      assert.match(err.message, /env 层第 2 行/);
      return true;
    }
  );
});

test('绕回更早的层：报环上引用那一行，不悄悄用空值顶上', () => {
  const config = loadConfig([
    { name: 'default', text: 'a = ${b}' },
    { name: 'env', text: 'b = ${a}' },
    { name: 'override', text: '' },
  ]);
  assert.throws(
    () => config.get('a'),
    (err) => {
      assert.ok(err instanceof ConfigReferenceError);
      assert.equal(err.layer, 'env');
      assert.equal(err.line, 1);
      assert.match(err.message, /a -> b -> a/);
      return true;
    }
  );
});

test('引用任何一层都没写过的键：报错，不顶空值', () => {
  const config = loadConfig([
    { name: 'default', text: 'x = ${missing}!' },
    { name: 'env', text: '' },
    { name: 'override', text: '' },
  ]);
  assert.throws(
    () => config.get('x'),
    (err) => {
      assert.ok(err instanceof ConfigUnknownKeyError);
      assert.equal(err.line, 1);
      assert.match(err.message, /missing/);
      return true;
    }
  );
});

test('解析错误带层名和行号', () => {
  assert.throws(
    () => loadConfig([{ name: 'default', text: 'ok = 1\n坏行' }]),
    (err) => {
      assert.ok(err instanceof ConfigParseError);
      assert.equal(err.line, 2);
      return true;
    }
  );
});

test('注释和空行被跳过，同层后写的键覆盖先写的', () => {
  const config = loadConfig([
    { name: 'default', text: '# 注释\n\nk = 1\nk = 2' },
    { name: 'env', text: '' },
    { name: 'override', text: '' },
  ]);
  assert.equal(config.get('k'), '2');
});
