# FAB DeWEB Browser

独立 Electron 桌面浏览器外壳，直接参考用户指定的 trytotapeout/TapeBrowser 源码并保留 GPL-3.0-or-later 许可，另参考 TapeKit 隔离设计，适配 FAB「IPFS 文件＋链上 CID 绑定＋HTTPS 网关」。当前仅接独立 FAB 测试部署，X Layer 196 仍是真实主网。本工具只读，不签名、不管理私钥。

## 运行

Node.js 22+、pnpm 10：

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm test
pnpm build
pnpm smoke
```

首次开发安装使用 `pnpm install` 创建锁文件。`build` 校验并生成 `dist/` 源码分发目录；不是签名安装包。分发目录需安装锁定依赖后通过 Electron 运行。当前未做 macOS 公证、Windows 签名或自动更新。

## 使用

点击“五子棋”，或输入配置中的容器地址、电路地址 `#3`、应用网关首页。先从两个独立 RPC 在同一区块核对链上 CID／版本，再打开固定版本 URL。刷新重新核对当前版本；后退／前进仅在该版本内导航。

页面显示网站名称、链、版本、CID 和验证范围。普通访问无需钱包。应用视图没有 Node、Electron preload 或开发者中心 IPC 权限；按容器使用独立持久会话。FAB 应用跨来源请求、跨版本导航和设备权限均拒绝；普通 HTTP/HTTPS 网页使用独立会话，不能借此绕过 FAB 网关绑定核验。因此本版本适合本地五子棋，不宣称支持任意外部 API、WalletConnect 或浏览器钱包扩展。钱包发布应点击开发者中心在普通浏览器完成。

## 配置

`src/config.mjs` 管理测试 Registry、两家 RPC、应用容器到独立 HTTPS 网关的显式映射，以及开发者中心 URL。新增应用需先核对规范容器与实际网关，再加入列表。当前不接受未知网关，不自动注册子域名，不把普通网址作为可信应用。

测试应用：电路 `0xe0A8D2c38BafeEA102F53095153F7a26cc82112c#3`，容器 `0x44725474373c73411D4261EFde83E4C1AD8186D4`，Registry `0xB84223d84b2b7F08927A13c9086Dc055Bf2aabDd`。

## 信任和可用性

双 RPC 验证的是链上 CID／版本绑定。内容由平台 HTTPS 网关获取，本客户端没有独立遍历／验证 IPFS DAG，也不宣称逐文件链上验证。网关和 Pin 节点仍是可用性依赖；本地电脑关机时，未缓存文件可能无法取得。需要独立托管 Pin 副本才能解决该问题。

不兼容官方 `tape://` 原链上文件格式；不沿用官方 DomainBinding 费用。无生产部署、矿机奖励、消息或资产转账功能。

本地历史与书签参考上游 library.js，按 FAB 应用去重保存；每个标签有独立应用视图，支持新建、切换和关闭；未搬入上游全链目录或扩展钱包桥。

来源与许可见 [UPSTREAM.md](UPSTREAM.md)。真实启动截图与状态在 `artifacts/desktop-smoke.*`，该目录不提交。

## 当前交付与验收

2026-10-10：20项单元/事件夹具测试通过，覆盖旧视图延迟失败不会覆盖当前视图，以及首次RPC失败后刷新重试。事件夹具不是实际网络并发测试。真实Electron启动另行验证：225格棋盘、黑白各一子、应用Node/IPC不可见、外部fetch受阻。每次smoke保存带时间戳的JSON及截图，最新别名仍为desktop-smoke.*。系统证书库解析出现日志，但本次HTTPS加载与隔离断言通过；没有关闭证书校验。

`dist/`含运行源码、依赖锁、测试和构建脚本，分发包不含node_modules；安装依赖后运行。不是可双击安装包，未签名/公证。源码和测试版下载发布在公开仓库 `cybercity001/fab-browser`，源码与测试版下载对所有人可见。

尚待产品确认：输入历史 `/v/版本/index.html` 地址时，目前会重新解析最新版；未改变这个行为。需要固定历史版本的语义，或限制地址栏只接受最新版入口。普通平台网关的历史版本URL仍可固定读取。


## 客户端构建与测试发布

与 TapeBrowser 的客户端目标一致：macOS Apple Silicon / Intel DMG、Windows x64 NSIS 安装器、Linux x64 AppImage。使用 `pnpm dist:mac`、`pnpm dist:win`、`pnpm dist:linux` 构建；产物位于 `release/`。建议在对应原生系统执行，不能把跨平台打包成功等同于该系统运行通过。

GitHub Actions 的 **Build and verify clients** 工作流手动触发，在四个原生 runner 上分别执行单元测试、构建、安装或解包安装器、启动实际客户端。`pnpm verify:client` 验证链上解析后加载 225 格棋盘、人机双方落子、双人黑棋五连胜、重新开始，以及应用不能获取 Node/IPC 或访问外部来源。测试依赖当前 FAB 测试 Registry、两个公共 RPC 和五子棋网关；网络故障会使测试失败，不会跳过验证上传安装器。失败证据也保留到 Actions artifacts。

全部平台验证成功后才创建 GitHub **prerelease**；下载公开可见，无需团队仓库权限。Release 附源代码 ZIP、安装包、SHA256SUMS 和测试证据。客户端没有自动更新机制，请从公开 Release 下载新版本。GPL 许可义务适用：向接收者分发二进制时，同时提供匹配源码和许可证。

测试安装包未获得 Apple Developer ID 签名/公证或 Windows Authenticode 签名。macOS 构建使用 ad-hoc 签名；系统可能阻止首次启动，团队正式分发前需配置各平台签名。CI 启动测试不等于已通过所有真实用户设备的安装、安全提示及系统兼容性验证。


## 浏览器界面

顶部保留当前应用标签和紧凑地址栏，主内容区从 96px 开始，底部显示访问状态。右侧侧栏按钮打开应用、历史、书签与 CID/版本信息；窄窗口中侧栏占满内容区，关闭后恢复应用。支持 Cmd/Ctrl+L 聚焦地址栏、Esc 关闭侧栏。“＋”新建标签页，标签可切换、关闭，页面和棋局保留到标签关闭；支持 Cmd/Ctrl+T 新建、Cmd/Ctrl+W 关闭当前标签。关闭最后一个标签会保留一个空白标签页。支持普通 HTTP/HTTPS 网页和域名输入，明确显示“未进行 FAB 链上绑定核验”；页内查找、缩放、原生菜单、右键菜单、历史／书签删除已加入。钱包桥、动态目录、本地预览、缓存设置和中英文尚待完整适配。

界面验收由实际 Electron 外壳按钮触发应用加载，在 1280px、800px、390px 宽度检查无横向溢出及侧栏与应用区域互不遮挡；截图分别保存外壳与应用视图，外壳截图中的空白内容区不是网站加载状态的证据。
