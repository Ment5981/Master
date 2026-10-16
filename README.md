# Master · AI 时间工作台

当前本机重构版本：**0.2.0-alpha.1**。这是可验收的核心开发版，不是商业正式版，也不代表需求文档全部验收完成。

通过语音/文字/选定工作记录生成可编辑草案，明确确认后安排任务。长期目标、分支、任务、日/周计划、四象限和周期复盘读取同一份本地数据。自然、克制的雾白与矿物绿界面，支持深色主题。

## 先体验

- Windows：安装 `release-v2/Master-Setup-0.2.0-alpha.1.exe`；安装包未配置发行者签名。
- 浏览器开发：`npm install` → `npm run dev`，打开终端显示的本机网址。
- 浏览器生产预览：`npm run build` → `npm run preview -- --host 127.0.0.1`。
- 首次进入是空白个人空间；侧边栏可进入独立示例空间，示例不会混入个人数据。

Windows 使用本机 SQLite，Web 使用当前浏览器 IndexedDB；两者**不自动同步**。请在“设置与数据”导出备份。旧版数据需要主动预览并确认导入，原文件不删除。清除浏览器网站数据会删除本地数据库。

## 阿里 AI / 语音配置

用户已选择阿里通义，密钥以后在本机配置。未配置时仍可手工管理；应用不生成假 AI 结果。

### Windows

1. 打开“设置与数据 → 阿里智能体与语音 → 配置桌面 AI 服务”。
2. 点击“打开本地配置目录”，编辑 `master-ai.env` 的 `DASHSCOPE_API_KEY=`。
3. 保存后重启 Master，在设置页检查连接。
4. 分别授权文字与音频发送，再点“说一说”。

服务内置，普通使用不需要 Node。配置文件位于 Electron 用户数据目录；设置页显示确切位置。密钥不放进前端、不写入计划备份；配置文件本身目前是本机明文文件，请勿上传、分享或纳入云盘。系统安全存储尚未接入。

### Web 开发

将 `server/.env.example` 复制为 `server/.env`，在本机填入密钥，再运行：

```powershell
npm run server
```

默认地址 `http://127.0.0.1:4318`。默认只接受本机开发/预览来源，不可当作匿名公网付费代理。公开网站上线需要另行实现账号、服务鉴权、配额计费和部署，不是静态页面上传后就能共享你的本机 AI 服务。

目前语音是实际麦克风采集 → PCM → 阿里实时 ASR；短播报使用设备系统语音，不是阿里云 TTS。联网识别/推理可能产生供应商费用。真实 Key、模型权限、中文识别与延迟仍待实测。

## 开发与验证

建议 Node 24 LTS 或兼容较新版本；Windows 构建使用 Electron 43。

```powershell
npm run lint
npm test
npm run typecheck:gateway
npm run build
npm run gateway:build
npm run desktop:dev
npm run desktop:build
```

独立 QA（合成数据，不读取个人空间）：

```powershell
# dev server :5173
npm run qa:v2
# production preview :4173
node scripts/v2-offline-qa.mjs
# 先 build 与 gateway:build
node scripts/v2-electron-qa.mjs
```

如果 npm 环境禁用了安装脚本而没有 Electron 二进制，先运行 `node node_modules/electron/install.js`。生成包在 `release-v2/`，不覆盖旧 `release/`。

## 代码结构

- `src/v2/core`：平台共用的命令、容量/日期校验、进度、复盘、幂等语义。
- `src/v2/storage`：Web Dexie 事务与桌面异步 IPC 适配。
- `src/v2/components`：今日、地图、大纲、计划、复盘、草案、设置。
- `src/v2/agent`：网关客户端、真实语音采集、短播报。
- `server`：通义模型与实时 ASR 网关、来源与结构校验、限流/取消。
- `electron`：安全桌面壳、本机 SQLite、内置网关。

旧 `src/components`、`src/store`、Android/iOS 工程保留但不再作为新版活动入口；当前不承诺移动端已适配或验收。未覆盖 GitHub 上另一套 Next.js/Cloudflare 原型，用户已选择先验收本机版再合并。

## 文档

- [需求基线](docs/rebuild-2026-09/01-product-requirements.md)
- [技术设计](docs/rebuild-2026-09/02-technical-design.md)
- [本轮实际交付与验收边界](docs/rebuild-2026-09/04-alpha-delivery.md)
- [AI 网关配置与接口](server/README.md)
