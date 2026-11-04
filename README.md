# 余烬协议 / Ember Protocol

正式游玩入口：[在线游戏](https://img-013.github.io/Ember-Protocol/)。当前 v0.9.1 恢复昨天的原界面、72×72 地图及逐格仓储版已有功能，详情见 [RESTORATION.md](./RESTORATION.md)。

本地运行：`node server.mjs`，打开 http://127.0.0.1:8000/ 。所有根目录文件一起部署；不只上传 HTML。

正式入口：index.html + colony-game.js + colony-framework.js + colony-people.js。原界面 CSS、开局、科技/政策、世界、人员、生产、物流、存档等保留。地图人物为小点，人物卡片仍显示原头像。

v0.9.0 技术实验单独保留在 simulation-lab.html；其 engine.js / tests.mjs / L4-REPORT.md 不代表正式恢复版的完成等级。原 GitHub 更早快照保留于 legacy.html。

后续开发必须在原 UI 和地图规模上增量完善，不得以另一套简化游戏替换。两份开发标准继续执行，剧情切片仅作参考。底层移植需逐项验证、保留功能及旧存档路径。

当前增量版本 v0.9.2：详见 [COLONY-PROGRESS.md](COLONY-PROGRESS.md)。正式游戏测试：npm test；实验室测试单独 npm run test:lab。启动新增 colony-bootstrap.js / colony-runtime.js。
