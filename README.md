# FAB DeWEB Browser

基于 [TapeBrowser](https://github.com/trytotapeout/TapeBrowser) `5f1d82c` 的 GPL-3.0-or-later 桌面浏览器，适配 FAB 的 **IPFS 文件 → Registry 登记 CID／版本 → 独立 HTTPS 网关**。目前接 FAB 测试合约；X Layer 196 是真实主网。访问应用无需钱包。

## 使用

- 顶部 **＋** 新建标签，支持切换、关闭、保留各页状态；地址栏支持普通 HTTP/HTTPS、容器地址、电路地址 `#NFT ID`、已配置应用名称和 `fab://容器地址/`。
- 侧栏 **浏览应用目录** 从 FAB Registry 发布事件发现应用，提供搜索、分类、排序、分页、图片和最近发布提示。刷新有进度、取消和持久化检查点；目录快照是缓存，打开应用时仍重新核对链上绑定。
- 有独立网关的应用可直接打开；其他发布记录需要先填写网关并核验其实际响应。不会自动购买域名或创建网关。
- 普通应用入口解析最新版。明确的 `/v/1/index.html` URL 会读取 Registry 的版本 1；每个版本有独立会话。刷新固定历史版本不会升级它，访问容器入口才解析最新版。
- 网站信息展示 CID、版本、发布者、发布文件及被阻止的外部资源；可检查最新版本和当前 NFT 持有人。发布权限由合约实时检查，浏览器目录不会授予发布权。
- **钱包** 在系统浏览器打开本机桥接页，使用已有钱包扩展。网站首次读取地址需批准，每次签名、切链或资产操作还需 FAB 来源确认及钱包最终确认。可撤销网站授权或断开钱包，页面跳转、账户／会话变化取消在途请求。未知钱包方法拒绝；不保存私钥／助记词，不内置扩展商店。
- **文件 → 预览本地网站**（Cmd/Ctrl+O）选择构建目录，支持 HTML／JS／CSS、本地修改自动刷新、打开目录、引用检查及静态安全检查。隐藏文件和越界符号链接拒绝读取，外部资源默认阻止；发布通过已有 FAB 开发者中心完成。
- **设置** 支持中文／英文／跟随系统、RPC 验证保存、缓存容量与清理、已核验历史版本列表。缓存版本需明确选择，显示“当前链上版本和所有权未核验”。
- 保留原生菜单／右键菜单、页内查找、缩放、前进后退、开发者工具、历史与书签管理。Cmd/Ctrl+T/W/L/F/D 为新页／关闭／地址／查找／书签，Ctrl+Tab 切换标签。

## 信任与可用性

链读取要求两个 HTTPS RPC 在同一区块核对绑定；不同主机名不证明运营方独立。FAB 应用仅读取固定版本的同来源资源，不向应用暴露 Node、Electron 管理 IPC、文件系统或设备权限。仅注入受限 EIP-1193／EIP-6963 钱包接口，主进程从真实主框架取得来源。

文件 SHA-256 对照 **网关发布清单** 校验，缓存身份包含链、Registry、容器、版本和 CID。**没有独立验证 IPFS DAG**，因此仍信任网关提供的清单与内容来源。缓存不保证已下载全站；未缓存文件仍依赖 IPFS Pin 和网关。当前 Pin 副本仍在同一台开发电脑，关机后不能保证未缓存资源可用，AWS 独立节点另行处理。

静态安全检查不能证明网站安全，报告明确列出未扫描文件；单文件扫描上限 4 MiB、总扫描上限 24 MiB，沿用上游防止资源耗尽的限制。本地目录／发布清单最多列出 2000 文件，浏览器磁盘内容缓存默认 512 MiB。发布服务上传额度独立配置，这些技术限制不是链上费用或奖励政策。

`test.fabx.com` 尚未绑定，当前使用 workers.dev。未部署生产合约，未实现矿机奖励／加速、官方 DomainBinding 费用或原 `tape://` 链上文件格式。FAB 的电路 NFT 管理网站发布权，五子棋运行不依赖电路计算。

## 开发和验收

Node.js 22、锁定 pnpm 10：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm smoke
pnpm start
```

`build` 校验源码并生成 `dist/`，不生成安装包。`src/config.mjs` 管理固定 FAB 测试 Registry、默认 RPC 和已核验网关；用户设置保存在 Electron userData 中。`src/catalog-seed.json` 是实际双 RPC 扫描取得的发布目录快照，刷新核对检查点哈希后增量读取。测试部署地址及上游来源见 [UPSTREAM.md](UPSTREAM.md)。

本次本地逻辑、文件／WebSocket 集成测试包括撤权竞态、导航取消、目录断点、最大 NFT 编号、缓存并发／损坏、候选网关强制核验及固定历史版本。真实 Electron 先验证当前发布版本，再固定历史版本 2 验证五子棋完整对局、普通网页隔离、本地目录热刷新、隐藏文件阻止、历史缓存、目录和语言切换；每次保留时间戳 JSON 和截图到忽略的 `artifacts/`。

钱包桌面测试使用**无资金的模拟扩展**，通过真实 preload → 主进程 → 本机认证 WebSocket 转发，不代表真实扩展交易验收。没有为测试广播链上交易。`--fab-smoke` 使用独立临时用户目录和仅测试的原生对话框替身，正常客户端不启用它。

## 客户端发布

目标：macOS Apple Silicon／Intel DMG、Windows x64 NSIS、Linux x64 AppImage。GitHub Actions **Build and verify clients** 在四个原生 runner 构建，安装或解包后启动实际客户端执行 smoke；任一验证失败不会上传该平台安装包。测试依赖真实 FAB 测试 Registry、两家公共 RPC 和网关，失败记录保留在 Actions artifacts。

四个平台通过后发布公开 GitHub **prerelease**，附匹配源码 ZIP、客户端、SHA256SUMS 和验收证据。没有自动更新器，请从 [GitHub Releases](https://github.com/cybercity001/fab-browser/releases) 下载。macOS 使用 ad-hoc 签名，未公证；Windows 未 Authenticode 签名。原生 CI 启动验证不等于已覆盖所有用户设备、真实钱包扩展和系统安全提示。
