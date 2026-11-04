# 余烬协议开发约定
先读 DEVELOPMENT-BASELINE.md、implementation-standard.txt、development-baseline.txt、RESTORATION.md。
最高优先用户纠正（2026-11-04）：正式游戏必须基于昨天 v0.6.8 逐格仓储版的原 UI、72×72 地图和全部已有功能增量开发，不能再用简化的技术样例替换。拆模块和因果链迁移必须保持功能与存档兼容；不能把实验工程测试结果算作正式游戏完成。
正式入口 index.html，脚本 colony-game.js / colony-framework.js / colony-people.js。simulation-lab.html 及 engine.js 是 v0.9.0 独立实验，只供渐进移植参考；legacy.html 是更早 GitHub 快照，也不能替代昨天版本。
用户覆盖：剧情切片仅参考，工程因果/守恒/固定 Tick/诊断/保存/回放标准仍执行。人物小点，地物融入地图，单格图像不越格。
交付前核对原功能并浏览器验证，随后按用户授权更新 GitHub main 和 Pages。准确报告完成范围，不宣称整本策划案已 L4。
