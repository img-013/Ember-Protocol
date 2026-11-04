# Ember Protocol 开发约定
先读 DEVELOPMENT-BASELINE.md、implementation-standard.txt、development-baseline.txt。
用户覆盖：剧情切片仅供参考，不强制指定医疗停电故事及前置门禁；工程因果、守恒、固定 Tick、诊断、保存、回放标准仍执行。
人物为小点；单格图像不越格；地物融入地图。新增系统须通过真实输入到结果、失败诊断、中间态保存及回放，不以界面打开作为完成。
当前发布入口 index.html；legacy.html 是此前 GitHub 单文件原型，保持只读参考。先读 L4-REPORT.md 了解未完成项，不删除或假报全量功能已完成。
修改后执行 node tests.mjs 并完成浏览器验收。后续持续交付源码与证据。
