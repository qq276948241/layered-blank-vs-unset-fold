# 三层分层配置（纯 JavaScript）

只用 Node.js 自带能力，零第三方依赖。默认层、环境层、本次覆盖三层叠合，
覆盖层优先级最高，默认层最低。

## 配置格式

一行一个 `键=值`；`#` 或 `;` 开头的行是注释，空行忽略。
值里可以用 `${其他键}` 引用，引用在最终叠合结果上解析。

```properties
host=127.0.0.1
port=443
url=${host}:${port}
greeting=        # 显式空串：这是“写过，值为空”
```

关键区分：

- **没写过的键**：三层里都不存在。取它/引它都报错，绝不当成 `''`。
- **写成空串的键**：明确赋值 `key=`，是“写过，值为空”。
  它会压掉更低层同名键的非空值；被引用时解析为空串，不报错、不穿透。

## 错误都带行号

自引用或绕回更早层形成环时，错误落在**真正合上环的那条引用行**
（不是入口行），并给出整条引用链，不会悄悄用空值顶上。

```
[环境层] env.conf:1:3 循环引用: a -> b -> a
[覆盖层] override.conf:1:3 引用了不存在的键 "ghost"，不用空值顶替
```

## 读取与合并：互相调用的两截

- `src/read.js`（读取一截）：`parseLayer` 解析一层并在解析时切 token；
  `readValue` 负责把一行展开，遇到 `${...}` 就回调注入进来的 `resolveRef`。
- `src/merge.js`（合并一截）：`createMerger` 决定从哪一层取值、维护引用栈、
  查缺键和查环；拿到记录后调回 `reader.readValue` 展开。

合并侧把自己的解析函数注入读取侧，读取侧遇到引用再调回合并侧——两截互相调用。
改任一处的契约，另一侧已通过的用例就会失败（见 `test.js` 最后一个用例）。

## 用法

```bash
# 打印全部最终键值
node src/cli.js examples/default.conf examples/env.conf examples/override.conf

# 取单个键
node src/cli.js examples/default.conf examples/env.conf examples/override.conf message

# 测试
node --test
```

代码里使用：

```js
const { loadConfig } = require('./src/index');

const config = loadConfig(['default.conf', 'env.conf', 'override.conf']);
config.resolve('url');   // 单个键
config.has('url');       // 是否写过
config.all();            // 全部最终值
```

## 文件

- `src/errors.js`：错误类型与报错文案（行:列、引用链）
- `src/read.js`：读取/展开一截
- `src/merge.js`：合并/解析一截
- `src/index.js`：接线与文件加载
- `src/cli.js`：命令行入口
- `examples/`：三层正常示例与一个坏环示例
