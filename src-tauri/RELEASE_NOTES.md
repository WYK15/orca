## Orcaw Tauri — Mac ARM64 测试版

基于 `v1.4.165` 维护线的首个 Tauri 预发布版本，支持 Apple Silicon Mac，最低 macOS 13.5。

### 本次提供

- Tauri 原生窗口、现有 Orca 界面、文件编辑及内容搜索。
- 独立 Node 后端、持久终端、Git 和 SSH 工作区服务。
- 系统钥匙串加密凭据、原生菜单、剪贴板和 macOS 通知接入。
- 网页使用 Chrome 打开；未安装 Chrome 时回退到系统浏览器。
- 关闭内嵌浏览器及浏览器自动化，保留 Markdown 预览。
- 关闭自动检查和下载更新。

### 安装

下载 `macos-arm64.dmg`，将 **Orcaw Tauri.app** 拖到 Applications；也可以使用 ZIP。
安装包经 Developer ID 签名和 Apple 公证，提供 SHA-256 校验文件。

该版本使用独立的应用名称和 `com.wyk15.orcaw.tauri` 数据目录，可与 Electron 版并存。
启动时可选择一次性导入 Electron 版当前配置中的项目和常规设置，无需逐个重新添加。
导入会备份 Tauri 配置，保留已有项目并去重；原 Orcaw 数据不会修改。
旧版加密凭据和托管账号不导入，相关账号及代理可能需要重新配置。

### 仍在迁移

- 通知横幅与实际点击跳转仍需在允许通知后进行实机验证。
- 插件面板、CLI 安装、部分 Agent/账号初始化及系统唤醒处理尚未完整迁移。
- 完整 SSH 远程编辑、终端恢复及异常退出流程仍需端到端验证。
- 本次只发布 Mac ARM64，Windows、Linux 和 Intel Mac 暂缓。

这是供测试的预发布版本，尚未达到 Electron 稳定版的完整功能覆盖。
