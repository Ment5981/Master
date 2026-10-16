# Master 本地 AI / 实时语音网关

这是**单用户本机开发网关**，仅监听 `127.0.0.1:4318`。不等于可公网部署的商业后端：还没有账号体系、持久额度账本、计费或跨进程幂等记录。不得改为 `0.0.0.0` 后直接公开。

## 配置与运行

需要 Node.js 22.9+（本次本机验证版本 25.6.0）。依赖由项目根 package.json 管理。

1. 参考 `server/.env.example` 创建 `server/.env`，填 `DASHSCOPE_API_KEY`。不要使用 `VITE_` 前缀，不把密钥放进前端设置、URL、截图或聊天。
2. 在项目根运行：

```powershell
node --env-file-if-exists=server/.env --import tsx server/index.ts
```

3. UI 网关地址设为 `http://127.0.0.1:4318`。没有配置 Key 时 health 仍返回 HTTP 200，`ai/asr/ready=false`；生成与申请语音返回明确 HTTP 503，不伪造模型结果。

默认北京旧域名仍为官方有效入口；可按业务空间/区域改成官方专属域名。北京和新加坡的服务地址、Key/模型权限需匹配。`ready=true` 只表示配置存在，**不代表验证了余额、密钥、模型权限或网络**。本次没有调用真实阿里 API。

`QWEN_MODEL=qwen-plus` 默认 JSON Object 模式 + 明确 JSON Schema 提示 + 本地严格 Zod 校验。该模式保证不了模型语义正确；引用匹配也只能证明原文出现过。仅当所选地区/模型明确支持 JSON Schema 才设置 `QWEN_JSON_SCHEMA=true`。默认关闭 thinking、不做自动重试，单次最多 7000 输出 tokens；每小时最多 60 次生成、同时 2 次，可通过环境变量收紧。

## 边界

- 仅访问客户端明确上传的有界工作区快照；不读取任何本机目录、Codex 历史、数据库或环境凭据；没有外部工具执行权限。
- 默认允许本机 Vite 的 5173 和 preview 的 4173 origins，同时验证 Host、远端地址、防止浏览器 DNS rebinding。无 Origin 的本机命令行可访问。
- `MASTER_GATEWAY_TOKEN` 是可选的**本地网关访问令牌**，与阿里 Key 不同。配置后客户端 `configureGateway({url,token})`；仅保存在页面内存，不持久存储。
- 默认不允许 `Origin: null`。如 Electron `file://` 必须使用它，要在 origin allowlist 显式加入 `null` **且配置本地访问令牌**；更适合正式产品的路线是受控原生代理或应用 origin。不要无令牌放开所有 null origins。
- 不记录请求正文、音频、Key、模型推理或上游错误正文。运行结果在本机进程内最多保留 5 分钟用于幂等重试；进程退出即丢失，不是持久同步协议。语音音频只在内存转发。
- 手动停止尽力取消上游，已产生费用不承诺返还。客户端另用输入版本及本地事务守住应用资格；网关从不写工作区。供应商留存政策由所选服务/区域决定。

## Electron 内置入口

`server/electron.ts` 无顶层启动副作用，导出 `startDesktopGateway({envPath, token, origin?})`：仅主进程传入绝对配置文件路径、至少32位随机会话令牌（建议 `randomBytes(32).toString('hex')`），返回 `{url, close}`。配置文件不存在时正常启动未配置模式；通过 `node:util.parseEnv` 读独立对象，**不修改 process.env，也不隐式采用父进程的模型 Key**。

默认来源为 `app://master`、`http://127.0.0.1:5173` 与 `http://localhost:5173`，不接受 env 覆盖来源/令牌/绑定地址。始终绑定127.0.0.1随机空闲端口，收费入口强制访问令牌；health仍可读。`close()`可重复调用，先取消运行/终止音频连接再关闭服务。

```powershell
node server/build-desktop.mjs
```

构建输出 `electron/gateway.cjs`，esbuild 使用 `platform:node / format:cjs / packages:external`；Electron打包须包含该文件与所有运行时依赖（Fastify、AI SDK、zod、ws等），不是把依赖复制进前端。主进程 `require('./gateway.cjs')`，窗口关闭/退出时调用 `close()`；不要把 envPath 暴露为可由 renderer 任意指定的 IPC 参数。

preload只向可信页面提供 `{url,token}`（本地会话访问令牌，不是阿里Key）。渲染入口在首次挂载之前取得配置并调用 `configureDesktopGateway({url,token})`；此后普通 `configureGateway(preferences)` 不会覆盖内置连接。网页模式同URL重复配置省略token时会保留内存token，显式传空字符串则清除，换URL自动清除以防跨地址泄露。令牌不写入workspace、localStorage或日志。

## 客户端 API

```ts
import { configureGateway, getHealth, generateProposal } from './src/v2/agent/client'
import { startVoice, speakText, stopSpeaking } from './src/v2/agent/voice'

configureGateway({ url: 'http://127.0.0.1:4318' })
const health = await getHealth({ signal })
const proposal = await generateProposal(agentInput, { signal, onStatus: setStatus })
// proposal 仍是 state:'draft'；只有独立的用户确认才能进入本地领域命令。

const voice = await startVoice({ signal, onTranscript: (text, final) => {}, onStatus, onError })
const editableText = await voice.stop() // 停止采集，等待 session.finished，返回完整最终文字
// voice.cancel() 丢弃后续结果并释放麦克风；不会自动调用生成或应用。
speakText('草案准备好了，确认后才会保存。')
stopSpeaking()
```

UI 必须在开始录音之前取得“麦克风 / 音频发送给阿里 / 文本发送给 AI”对应授权；取消、关闭窗口及重复点击须用同一个 AbortController 管理，包括尚在等待麦克风权限的阶段。转写可以先展示/更正，再送入同一文字入口。不要将临时字幕当作确定指令。

`speakText` 是浏览器/操作系统 `speechSynthesis` 短句播报（最多 300 字），**不是阿里云 TTS，也不保证离线**；具体声音/网络依赖由系统实现决定。health.tts=false 指云 TTS 未接入。

### HTTP（JSON，不伪装 token 流）

| 接口 | 请求/响应 |
| --- | --- |
| `GET /api/health` | `GatewayHealth`，不需本地 token |
| `POST /api/agent` | body 为 `AgentInput`；必需 `X-Request-ID`（8–128 位 ASCII 标识）；200 返回 `Proposal` 本体 |
| `POST /api/agent/:id/cancel` | 空 JSON；尽力停止运行，幂等；取消不撤销客户端已应用内容 |
| `POST /api/voice/ticket` | 空 JSON；返回单次 ticket、15 秒过期时间、16kHz格式、120秒上限 |

同一 request ID + 相同输入在存活窗口返回同一个结果；不同输入返回 409。不自动重试收费生成。终态错误统一 `{code,message}`，不泄露上游凭据。客户端 `generateProposal()` 每次生成一个新 ID；浏览器取消会触发取消请求。当前 API 不支持跨重启恢复，也没有 SSE 断点续传承诺。

### WebSocket 语音协议

`ws://127.0.0.1:4318/api/voice`，**URL 禁止任何 query 凭据**。先通过受保护的 HTTP 接口取得 ticket；连接后三秒内第一帧发送 `{"type":"auth","ticket":"..."}`。票据绑定申请 IP 和 Origin、只能用一次。验证前不连接阿里。

收到 `{type:'ready',sampleRate:16000}` 后发送二进制 **16kHz、单声道、PCM16 little-endian**。客户端在 AudioWorklet 中从设备实际采样率重采样，每 100ms 发送 3200 bytes；不是将 MediaRecorder 的 WebM/Opus 错当 PCM。

- `{type:'transcript',itemId,text,final:false}`：临时句子预览，阿里 `text + stash` 合并，不累计重复前缀。
- `final:true`：对应句子的最终文字；按 itemId 替换，按顺序组合。
- 客户端 `{type:'finish'}`：先 flush 最后 PCM 帧，网关发送 `session.finish`，等最终转写与 `{type:'finished'}` 后断开；不能提前关 socket 丢掉最后一句。
- 客户端 `{type:'cancel'}` 或断开：立即释放双方连接，不等待生成。
- `{type:'error',code,message}`：固定安全错误文字，客户端保存已展示字幕以便人工修正。

网关限制每帧 6400 bytes、每秒 80 消息/64000 bytes、实时累计速率、2 个并行会话、120秒单次时长、15秒无音频空闲、12秒结束等待、缓冲背压；有握手与单次票据限流。音频 socket 不接受用户指定供应商 URL、模型名或任意工具消息。

Worklet 通过 `?url&no-inline` 构建成独立同源资源，不使用 Blob/data 脚本、不放宽桌面 CSP。真实 Electron 已验证模块加载和节点创建；该探针不打开麦克风。

## 无付费调用验证

```powershell
npx tsc -p server/tsconfig.json
npx vitest run --config server/vitest.config.ts --configLoader native
```

测试包括无 Key、鉴权/Origin/Host、非法输入、上游超时、额度、严格输出、逐字证据、助手声明不能升级完成、幂等/取消；真实 AI SDK HTTP 适配器连接**本机 mock**；WebSocket 连本机 mock 验证阿里协议、PCM、临时/最终字幕与单次票据；Worklet 验证 16k/44.1k/48k 重采样及静音输出。真实麦克风、Windows WebView2、中文口音噪声、阿里网络/模型延迟和实际成本仍需 Key 配置后另行验收。

桌面端隐藏 smoke：`node scripts/v2-electron-qa.mjs`。脚本自行在 `.visual-qa` 下创建隔离用户目录；不会读取真实配置。成品验证可指定绝对 `MASTER_ELECTRON_EXECUTABLE` 路径，脚本会先检查 ASAR 内隔离启动保护，再传 `--smoke-test` 与独立 profile；程序仅在这两个条件都合法时启用隐藏离屏测试。发布内容扫描：`node scripts/v2-artifact-audit.mjs <app.asar绝对路径>`，只报告可疑路径/类别，不输出匹配的凭据。

## 一手协议依据（查阅 2026-09-28）

- [阿里 Qwen 结构化输出](https://help.aliyun.com/en/model-studio/qwen-structured-output)
- [Qwen ASR WebSocket：入口、鉴权、结束时序](https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-interaction-process)
- [客户端事件：PCM、session.update、append、finish](https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-client-events)
- [服务端事件：text + stash、transcript、finished](https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-server-events)
- [AI SDK OpenAI-compatible 实现](https://github.com/vercel/ai/tree/main/packages/openai-compatible)
