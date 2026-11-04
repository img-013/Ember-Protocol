# v0.9.0 L4 实施设计

本轮以 v0.8.0 / v0.8.1 可玩内容为行为基础，迁移为真实命令和任务驱动。全量策划库中的远期模块仍逐项验收，剧情切片不构成门禁。

模块依赖
client.js → engine.js / save.js / map.js / clock.js
engine.js → definitions.js / world.js
save.js → engine.js / definitions.js
map.js → definitions.js，只读状态

唯一状态所有者 engine.js。UI 仅保管选择、镜头、暂停倍率和对话框状态。25 Hz 固定 Tick，每格 2 米、40 Tick 步行。暂停、后台恢复和倍率由 wall-clock 适配器控制。

每 Tick 依次处理稳定排序命令、供需与电池分配、需求、任务发布、路径与任务执行、社会事实与持续风险。资源以整数单位处理。

Command 包含 id、type、payload、issuedTick、executeTick、sequence。结果含 status、reasonCode、affectedIds、factIds。Job 包含 id、kind、target、state、owner、work、path、reservation、reason、retryTick、sourceFactIds。Fact 含 id、type、tick、actors、objects、causes、metrics、text。

建造材料预留至任务 escrow，完成时消耗、取消时归还。机器工作位、输入与输出容量预留到工作任务；停电暂停，目标消失释放。搬运先预留来源和可用储存格，到达取货再携带送达，不瞬移入账。所有阻塞显示原因和建议。

事实按明确来源生成，Memory 与关系引用事实，Issue 根据真实持续短缺建立并支持修复建议。命名与修改政策通过命令留下事实。没有定时强制伤害或无来源馈赠。

存档 schema 3，含 build/content 版本、权威状态、pending、日志、来源 checkpoint、hash。旧 v0.8.0 schema 2 迁移保留原始数据作为来源 checkpoint；旧 v0.6.x 不自动伪迁移。

hash 使用键排序与整数状态，排除渲染信息。新局回放由 seed+命令日志重建；旧档回放由迁移 checkpoint+后续日志重建，明确区别。校验目标包含 10,000 Tick、运行中读档、资源守恒、抢占、无路、满仓、断电、72 游戏小时。

目标浏览器 Chrome/Edge 当前稳定版，静态 GitHub Pages，28×18 基础地图与 6 人。300×300 / 200 人为性能远期目标，不在无证据情况下宣称达成。
