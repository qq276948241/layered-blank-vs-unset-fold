# 分层配置

纯 JavaScript（`node:assert` / `node:test` 等内置模块），无第三方依赖。

## 规则

- 三层按优先级从低到高叠加：默认层、环境层、本次覆盖。后面的层盖住前面的层，叠完才是最终值。
- `key =`（空字符串）是**写过的值**，会盖住低层；某层**没写过的键**才会落回低层。两者不是一回事。
- 值里可以写 `${key}` 引用其他键，按合并后的视图解析。
- 某一层指到自己、或绕回更早的层形成环：在**引用那一行**抛 `ConfigReferenceError`（带层名、行号、环链），绝不悄悄用空值顶上。引用任何层都没写过的键，抛 `ConfigUnknownKeyError`。

## 结构

读取和合并是互相调用的两截，契约在 `layered-config.js` 里：

- 读取半 `readEntry` / `readValue`：定位某键最终由哪一层提供原始条目（用 `Map.has` 区分"没写过"和"空字符串"），然后交给合并半。
- 合并半 `mergeEntry`：展开条目里的 `${ref}`，每个引用回到读取半取条目再递归展开；环检测的链在两边之间传递。

只改其中一处而不动另一处，原本能过的例子会坏——改动时两半要一起改。

## 用法

```js
const { loadConfig } = require('./layered-config');

const config = loadConfig([
  { name: 'default', text: 'base = /srv\ndir = ${base}/app' },
  { name: 'env', text: 'base = /opt' },
  { name: 'override', text: '' },
]);

config.get('dir'); // '/opt/app'
config.has('dir'); // true
config.toObject(); // 全部键的最终值
```

层文件格式：每行 `key = value`，`#` 开头为注释，空行跳过；键值两端空白会被裁掉。

## 测试

```sh
node --test
```
