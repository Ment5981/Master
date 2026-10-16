# Master 重构调研与现状记录

调研日期：2026-09-28 · 修订：0.2。用途：为[需求文档](./01-product-requirements.md)和[技术设计](./02-technical-design.md)提供依据；新增[AI 智能体与语音专项研究](./03-ai-agent-research.md)。

## 1. 结论先行

推荐从“单目标展示原型”重构为“语音优先、AI 主动澄清、可信数据、可执行的自然风格时间工作台”。用户说出意图或提供工作记录，智能体整理事实、填充目标、提出计划，用户批量确认或纠正；地图呈现成果与下一步，而非先让用户花时间搭图。保留 React/TypeScript、React Flow 与任务单一数据源，重建领域规则、持久化和对话到行动的闭环。

技术候选为 Windows Tauri 2 + SQLite、Web React/Vite + Dexie；Tauri 必须先通过桌面实测，Electron 可继续作为过渡壳。M1 即引入 AI SDK、有限状态智能体和 ASR/TTS 网关；完整云同步在商业阶段扩展。语音与文本推理依赖网络不等于所有任务必须上云，离线手动核心仍可使用。换框架本身不构成性能改善的证据。

产品研究重点：Heptabase 的空间上下文，Sunsama 的现实容量，Things 的日期语义，Linear 的低干扰层次。自然审美落在分支、留白、材质和状态反馈，不把高频工作区做成持续运动的景观。

## 2. 证据范围与限制

- 本地审计对象：`D:/Ment/claude/master` 的源码、README、配置、测试代码和历史 `.visual-qa` 截图。
- 当前目录没有 `.git`，`git status`/`rev-parse` 均失败；不能推断它等同 GitHub 某个提交。
- 对用户原仓库 [Ment5981/Master](https://github.com/Ment5981/Master) 的网页及 raw README 抓取未成功，不据此认定仓库删除、私有或本地已是最新。实现前需核对远端与本地差异。
- 开源与产品资料使用官方 GitHub、LICENSE、产品页、帮助文档。调研没有登录竞品做完整试用，没有测量竞品性能。
- 2026-08-15 的 Android 测试是特定模拟器、旧构建、小样本证据，不能外推 Windows/Web，也不当作新版验收成绩。
- 下述“可借鉴”“推荐”“预算”均为本项目判断；事实与推测分开。未用 star 数或某个宣传 benchmark 代替选型。

## 3. 当前工程审计

### 3.1 已有基础

本地 package 声明 React 19、TypeScript 6、Vite 8、Zustand 5、React Flow 12、Radix、Tailwind 4、Electron 43、Capacitor 8。这些是本地版本声明，不代表本次核实过最新版本。

当前没有服务端。Windows 用 Electron 主进程 JSON 文件，Web 用 localStorage，移动端用 Preferences。五个页面懒加载，已有浅深主题与减少动效样式；Electron 已开启 context isolation/sandbox，关闭 Node integration。

### 3.2 影响重构的代码事实

以下行号基于本次本地快照；实施后行号可能改变。

| 事实 | 证据 | 对重构的要求 |
| --- | --- | --- |
| 新建目标替换所有目标、节点并清空任务/复盘 | `src/store/useMasterStore.ts:135`，入口 `src/components/AppShell.tsx:138` | 优先设计追加创建、目标切换与迁移 |
| 页面只取首目标 | TodayView:25、GoalMapView:96、PlanView:72、ReviewView:70 | 查询明确 workspace/goal 范围 |
| 任务共用 tasks/nodeId，象限只是任务属性 | `src/domain.ts:54`、store:225 | 保留单一事实源 |
| 图谱只有 parentId；画布不呈现任务节点 | `src/domain.ts:41`、GoalMapView | 新增 typed relations 与任务投影 |
| 地图禁拖动/连线，固定从左到右布局 | `src/features/map/GoalMapView.tsx:143` | 稳定自动布局、局部展开、可控编辑 |
| 有子节点时忽略直属任务进度 | `src/lib/metrics.ts:46`；TaskComposer:91 允许该归属 | 建立并测试统一进度口径 |
| plannedDate 同时写 dueDate | `src/components/TaskComposer.tsx:45` | 分离计划和截止；迁移保留原值并提示歧义 |
| 每个分支都使用整个目标 weeklyHours | `src/lib/metrics.ts:95` | 改为用户级容量账本 |
| 复盘本期任务与累计分支数据并列，建议无历史快照 | `src/features/review/ReviewView.tsx:75,105` | 周期事件/投入与快照分开 |
| 引导开放状态未持久化，重新载入可能再次开向导 | store:66、274；GoalWizard:82 | 启动需等待数据恢复并按完成状态判断 |
| 每次字段变更可触发整个状态序列化 | NodeDetailPanel:85、store persist 配置 | 按实体事务写入，界面草稿与提交分开 |
| 同步 IPC 读与主进程同步文件写 | `electron/preload.cjs:4`、`electron/main.cjs:10,25` | 异步桥接、数据库事务和保存回执 |
| 5,000,000 字符以上写入直接不处理且无回执 | `electron/main.cjs:61`、preload:5 | 不能无声忽略写入；异常路径可恢复 |

这些问题由代码路径确定，但未声称用户实际已经丢失数据。重复遍历、全量写入可能导致延迟，是静态风险，需基准测量确认影响。

### 3.3 存储与迁移入口

- Web：`localStorage['master-local-state']`。
- Electron：`app.getPath('userData')/master-state.json`；真实路径由应用接口获取，不猜测固定目录。
- 移动：Preferences 同名 key；本次不继续移动开发，保留数据兼容需求。
- 封装：Zustand persist v1，包含 goals/nodes/tasks/reviews 与 theme/activeView/onboardingComplete。
- 当前没有迁移、导入导出、备份 UI、同步或账号。原子临时文件 rename 的思路可保留，需补恢复与错误处理。

本次未读取用户真实数据库。迁移必须先备份、校验、预览异常、转换到临时库，成功后切换；旧源保留。

### 3.4 视觉观察

查看了现有 `.visual-qa/03-map.png` 和 `02-today.png`。旧版已经使用矿物绿和浅底，但地图节点几乎同尺寸白卡片、直角连线、规则网格；今日页大标题和统计条占比高。整体更像功能概览，缺少“我现在操作哪个分支”的空间焦点。

这不要求简单增加颜色。新版应减少无效卡片，区分目标/要素/成果/任务形态，保留局部上下文，使实际行动成为视觉主角。

## 4. 开源组件与产品调研

许可证结论来自下列官方文件，仍需在引入时针对锁定版本和具体目录复核并保留 notices。本表不是法律意见，也不把 copyleft 等同于禁止商业化。

| 项目 | 事实与许可来源 | 本项目采用结论 |
| --- | --- | --- |
| React Flow / xyflow | [仓库](https://github.com/xyflow/xyflow)、[MIT LICENSE](https://github.com/xyflow/xyflow/blob/main/LICENSE) | 保留为结构化节点画布；重构数据订阅与节点组件 |
| Dagre | [仓库](https://github.com/dagrejs/dagre)、[MIT LICENSE](https://github.com/dagrejs/dagre/blob/master/LICENSE) | 初版层级布局候选；固定位置合并和分支折叠需自己定义 |
| ELK.js | [仓库](https://github.com/kieler/elkjs)、[EPL-2.0 LICENSE](https://github.com/kieler/elkjs/blob/master/LICENSE.md) | 嵌套分组/复杂连线路由确有需要时采用 Worker 版本；先审对应分发义务 |
| Super Productivity | [仓库](https://github.com/super-productivity/super-productivity)、[MIT LICENSE](https://github.com/super-productivity/super-productivity/blob/master/LICENSE) | 最接近实用时间管理，研究估时、timeboxing、休息和备份规则；Angular 架构不整仓替换 React |
| Excalidraw | [仓库](https://github.com/excalidraw/excalidraw)、[MIT LICENSE](https://github.com/excalidraw/excalidraw/blob/master/LICENSE) | 研究直接操作与低压视觉；不同时引入第二套主画布引擎 |
| Logseq | [仓库](https://github.com/logseq/logseq)、[AGPL-3.0 LICENSE](https://github.com/logseq/logseq/blob/master/LICENSE.md) | 研究关系与日记上下文；闭源商业路线不直接复制其核心代码 |
| AppFlowy | [仓库](https://github.com/AppFlowy-IO/AppFlowy)、[AGPL-3.0 LICENSE](https://github.com/AppFlowy-IO/AppFlowy/blob/main/LICENSE) | 参考工作区与数据自主；Flutter/Rust 技术不适合本轮整仓移植 |
| AFFiNE | [仓库](https://github.com/toeverything/AFFiNE)、[分区 LICENSE](https://github.com/toeverything/AFFiNE/blob/canary/LICENSE)、[backend 单独许可](https://github.com/toeverything/AFFiNE/blob/canary/packages/backend/server/LICENSE) | 研究同一内容不同视图；它是混合许可，不能把整个项目一概当 MIT 商用底座 |
| tldraw | [仓库](https://github.com/tldraw/tldraw)、[当前 LICENSE](https://github.com/tldraw/tldraw/blob/main/LICENSE.md)、[生产许可说明](https://tldraw.dev/community/license) | 交互参考；当前生产使用需按其许可取得授权，不按旧的 MIT 印象引入 |

React Flow 官方建议缩小状态订阅、稳定节点组件引用、折叠大树并简化复杂样式。是否开启可见元素裁剪需要测量，它自身也有成本。[性能指南](https://reactflow.dev/learn/advanced-use/performance)、[可见元素选项](https://reactflow.dev/api-reference/react-flow)

布局方案比较见 [React Flow 官方布局文档](https://reactflow.dev/learn/layouting/layouting)。Dagre 更轻便，但对复杂子图有局限；ELK 功能更多，不代表所有小图都需要它。

## 5. 设计与产品机制参考

以下商业产品只作为机制和视觉研究，不复制品牌、截图、字体授权资产或专有代码。

| 参考 | 官方依据 | 借鉴到 Master 的具体位置 | 控制范围 |
| --- | --- | --- | --- |
| Heptabase | [基本对象](https://wiki.heptabase.com/fundamental-elements)、[界面逻辑](https://wiki.heptabase.com/user-interface-logic) | 一份实体多种呈现，地图旁展开详情，任务保留来源上下文 | 不扩张成全量研究资料库 |
| Sunsama | [每日计划](https://help.sunsama.com/docs/usage-guides/daily-planning/)、[时间块](https://www.sunsama.com/features/timeboxing) | 先估容量再选任务，允许只排队或精确到时间段 | 仪式可跳过，不把每分钟排满 |
| Things | [日期视图](https://culturedcode.com/things/support/articles/4001304/)、[功能与产品图](https://culturedcode.com/things/features/) | 计划时间与截止分离，任务行简洁、细节渐进展开 | 保留 Master 自己的图谱路径 |
| Linear | [2026 年 UI 更新](https://linear.app/changelog/2026-03-12-ui-refresh)、[设计解释](https://linear.app/now/behind-the-latest-design-refresh) | 导航退后、内容突出、头部操作位置稳定 | 不照搬工程管理密度 |
| Milanote | [视觉项目管理](https://milanote.com/product/project-management) | 不对称分组、空间组织、分支留白 | 默认自动布局，避免让用户花时间排版 |
| AFFiNE | [官方产品](https://affine.pro/) | 目标说明与地图可切换，离线编辑意识 | 不做通用文档/数据库全家桶 |
| Amie | [任务文档](https://amie.so/documentation/features/tasks)、[当前主页](https://amie.so/) | 拖任务到日历、调整日期/时长 | 现主页已偏 AI 会议与排程，不用旧日历截图概括现状 |
| Daylight | [官方品牌与产品](https://daylightcomputer.com/) | 自然材质、平静专注和明亮空间感 | 是硬件品牌，只参考情绪与材质表达 |

### 设计合成

建议用“自然空间中的清晰行动”作为视觉准则：雾白/深墨基底、苔绿动作、柔和曲线、真实分支长度形成的参差与留白。详情、菜单与按钮位置稳定，复杂度藏在可展开的细节中。

自然装饰集中在欢迎、空状态、复盘封面。任务执行和地图编辑要保持可读与可定位。首版不引入常驻粒子、全屏 3D、持续力导向或所有连线不停流动的效果。

此前 taste-skill 主要服务展示型网页，其完整 landing page 规则不适用于本产品多步骤工作台；本稿只参考审美克制、先审计再重构和动效有含义的原则。

## 6. Windows/Web 技术选型研究

### 桌面壳

Tauri 2 在 Windows 使用系统 WebView2，通过 Rust Core 与 WebView 通信。它不在每份应用内携带同一份完整浏览器，但缺少运行时的机器仍需要安装 WebView2；离线/固定运行时分发会增加包体。[进程模型](https://v2.tauri.app/concept/process-model/)、[Windows 分发](https://v2.tauri.app/distribute/windows-installer/)

因此推荐将其作为候选目标，而非预先承诺“换壳后更快”。使用相同数据和相同前端，比较 IME、启动、帧耗时、异步数据库操作与总进程资源。Electron 外壳与 NSIS 分发已经有基础，可保留过渡。[Electron 性能指南](https://www.electronjs.org/docs/latest/tutorial/performance)

本轮不换 Flutter/纯原生桌面：会增加 UI/图谱重写成本与 Web 双实现负担。应用编辑器不需要为 SEO 改成服务器渲染；未来官网可独立建设。

### 本地存储

Windows 候选 SQLite，Web 采用 Dexie/IndexedDB，两者实现统一业务命令与 Repository 契约。SQLite 支持本地关系与事务；Dexie 简化浏览器数据库访问，但并不自动连通不同设备。[Tauri SQL](https://v2.tauri.app/plugin/sql/)、[SQLite 版权](https://sqlite.org/copyright.html)、[Dexie React 文档](https://dexie.org/docs/Tutorial/React)、[Dexie Apache-2.0](https://github.com/dexie/Dexie.js/blob/master/LICENSE)

浏览器存储有配额和清理行为。持久化请求可能不获准，不能替代同步或用户导出；产品必须展示本地数据状态并提供备份。[MDN 存储与清理](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)、[Dexie 持久化说明](https://dexie.org/docs/StorageManager)

### 同步方案

| 候选 | 已核实能力/边界 | 决策 |
| --- | --- | --- |
| 受限业务命令 + PostgreSQL | 自建方案；需要自己实现鉴权、幂等、outbox、版本、冲突、恢复与隔离 | 商业阶段默认设计候选；专项验证通过才提供同步承诺 |
| PowerSync | [Web SDK](https://docs.powersync.com/client-sdks/reference/javascript-web)提供本地 SQLite/同步队列，写入业务仍需后端；[Tauri SDK](https://powersync-ja.github.io/powersync-js/tauri-plugin)及[官方组织](https://github.com/powersync-ja)当日标 alpha | 云同步首发刚需时做替代 spike；不要把 alpha 唯一通道直接上生产 |
| Electric | [官方 writes](https://electric.ax/docs/sync/guides/writes)明确聚焦 read-path，写回另行实现；[Apache-2.0](https://github.com/electric-sql/electric/blob/main/LICENSE) | 适合既有 Postgres 读分发，不是直接拿来完整双向离线同步 |
| Yjs | [仓库与 MIT 许可](https://github.com/yjs/yjs)提供 CRDT 共享类型，网络 provider 独立 | 未来多人同时编辑时采用，不用它替代业务规则校验 |
| Dexie Cloud | [官方服务](https://dexie.org/cloud)提供云同步/认证能力 | Web 为主的托管替代；若桌面坚持原生 SQLite，需调整存储路径 |

[PowerSync 许可](https://powersync.com/legal/licensing-terms)区分 Apache-2.0 客户端、FSL Open Edition 服务与商业产品，不能把整套统称无约束开源。自建同步同样有工程和运维成本，不等于免费捷径。

## 7. 流畅与自然感的共同约束

- 操作反馈先呈现，本地提交有回执；云端请求不阻塞勾选、打字、拖动。
- 图谱只因结构/展开状态变化布局，普通完成事件只更新相关节点。
- 动画优先 transform/opacity，减少大面积模糊与布局重排。[动画性能指导](https://web.dev/articles/animations-and-performance)
- Web 线上 INP p75 ≤200ms 是响应目标；拖拽帧时间和本地落盘耗时单独测。[INP](https://web.dev/articles/inp)
- 保持可读对比度、键盘路径、拖拽替代与减少动效。[WCAG 2.2](https://www.w3.org/TR/WCAG22/)、[交互动效解释](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

具体数据量、基准机、采样与达标门槛写入技术文档，不把“采用某个框架”视为验收。

## 8. 研究后仍需验证的事情

1. 个人/团队和首发市场的用户答复，目前是草案假设。
2. Tauri 在目标 Windows 环境的真实手感与部署路径，尤其 IME、WebView2 和打包更新。
3. 目标地图在 150 个可见节点、1,000 任务，以及 10,000 任务压力数据下的成本。
4. 用户是否能通过少量语音对话/导入记录形成第一份可执行计划；把读草案、追问和纠错时间计入后，是否真正比手工维护省时，并愿意次周继续使用。
5. 商业版对智能整理、语音分钟/AI额度、同步与恢复的付费意愿和真实成本，不以视觉喜好或模型文案流畅代替商业验证。
6. 实施前核对本地与 GitHub 基线，为具体引入版本建立依赖清单和许可证记录。

## 9. 本次补充：AI 与语音成为产品核心

原 v0.1 把 AI 放在后续阶段，不再符合用户最新明确要求。修订后的推荐链路是“语音/文字/选定记录 → 理解与关键追问 → 带证据的目标/任务变更草案 → 用户一句话或按钮确认 → 本地命令事务 → 地图/计划/复盘同源更新”。

专项研究核实了 AI SDK、CopilotKit、Tambo、LangGraph、Task Master、Khoj、思源/Logseq、语音服务及 Codex 官方接入方式。结论是可复用交互和模型接入组件，但本次研究范围内没有确认一个可直接满足完整流程、商业许可和本地一致性要求的现成项目；这不代表市场不存在此类产品。

最小技术建议：AI SDK Core + 自有提案/命令边界；流式 ASR 与简短 TTS；不整仓移植 Task Master，不默认引入多智能体集群，不在用户选择来源之前扫描私人聊天。技术证据、许可证与方案取舍集中见[专项研究](./03-ai-agent-research.md)。

本次只生成/修订方案文档，未改动现有业务实现、真实用户数据、GitHub 仓库或发布产物，也未录音或调用付费模型。
