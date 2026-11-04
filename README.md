# 余烬协议 / Ember Protocol

基于浏览器的殖民地模拟游戏。当前发布 v0.9.0：固定 Tick、任务、采集与搬运、有限矿藏、生产供电、需求、政策、真实事实和可回放存档。

在线游玩：https://img-013.github.io/Ember-Protocol/

## 启动与验证

需要 Node.js 20+；无第三方依赖。

```sh
node server.mjs
# 打开 http://127.0.0.1:8000
node tests.mjs
```

使用 HTTP 服务器或 GitHub Pages；不要双击 file:// 打开 ES Modules。仓库根目录即发布文件，无打包步骤。所有模块与 index.html 一同上传，不能只替换 HTML。

## 开始游玩

默认暂停。规划太阳能与藻类农场，按 1× 等待施工。拖动框选采集、储存区和居住区；人物到场作业后产生掉落物，搬运者送入仓库才变为可用库存。每格只存一种物品并有堆叠上限。初始物资为登陆舱储备，单独登记。

采矿站开采邻近三格内的有限金属矿藏。研究解锁工坊及医疗站；政策改变实际限电顺序及需求抢占阈值。工作优先级 1 最高、4 最低、0 禁用。任务遇到满仓、无路、缺料、停电会给出原因。

保存到浏览器 localStorage 的 ember.v090；导出 JSON 可独立备份。读取支持原 v0.8.0 schema 2（原档另存 ember.v080.backup），旧任务按迁移规则重建。更早单文件版本不能自动迁移。导入 demo-save.json 可检查示例局，demo-commands.json 为对应输入日志。

## 工程与完成范围

- definitions.js / world.js：内容定义、校验、种子地图与路径。
- engine.js：唯一游戏状态、命令、任务、库存、生产、电力、需求及事实。
- save.js / clock.js：版本化存档、回放和固定时钟。
- client.js / map.js / game.css：只读查询显示、命令输入与地图绘制。
- tests.mjs / verification.json：可重复测试及本次执行结果。
- runtime-content.json：本次运行定义快照；planned-content.json：原策划库导入存档，仅 L1，不代表已执行。
- DESIGN.md / L4-REPORT.md：实现结构、验收范围、限制和后续依赖。

L4 只指已验证的具体闭环，不代表整本策划案已完成。全量自动化流水线、世界远征、完整科技政策树等仍在后续开发范围。原 GitHub 单文件原型保留在 [legacy.html](./legacy.html)，便于查看历史内容；其显示效果不作为新版因果闭环的验收证据。
