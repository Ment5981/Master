# Master：AI 智能体与语音优先专项研究

日期：2026-09-28 · 版本：0.2 · 状态：研究与设计建议。后续已选择阿里通义并实现 Alpha 适配，见 [交付记录](./04-alpha-delivery.md)；尚未进行真实供应商质量/性能实测。

配套：[需求文档](./01-product-requirements.md)、[技术设计](./02-technical-design.md)、[原系统与视觉研究](./00-research.md)。本文件中的能力事实来自官方文档/仓库；推荐、指标与交互示例是 Master 的设计提案。

## 1. 产品重新定义

Master 是一个可以用语音交谈的个人行动智能体：听用户讲目标、今天的事情与困难，主动补问关键问题，也能读取用户选定的开发/聊天记录；整理已发生的事实，提出目标地图和下一步计划，经确认落到真实任务中。用户随时能说一句话纠正，或直接手动修改。

核心不是“AI 给一段很长的建议”，也不是“先填好表格再请 AI 润色”。核心是减少从想法、工作记录到可执行安排之间的维护时间。地图、四象限、日历与复盘应成为同一结果的清晰视图。

用户新增要求明确覆盖原稿：AI 和语音属于首版核心，智能体可以主动追问；文字是等价入口，不能把语音仅实现成让用户调用系统听写。默认不常驻监听，不自动扫描整台电脑。

本次研究未发现可直接确认覆盖“语音对话＋记录证据＋目标图谱＋现实容量＋可靠本地写入＋商业许可”的完整现成底座，因此推荐组合成熟基础组件，自建少量关键业务协议；这不是对所有开源项目或市场的穷尽判断。

## 2. 开源/产品参考：能借什么，不能直接当什么

许可证需在引入具体版本/目录时再核实，保留 notices；以下不是法律意见。AGPL 不等于禁止商业使用，但闭源商业路线需要评估其相应源码义务；附限制条款的源码可见项目不能按普通 MIT 开源组件对待。

| 项目 | 已核实的相关能力/许可 | Master 判断 |
| --- | --- | --- |
| Vercel AI SDK | TS 流式、结构化输出、provider 与工具调用；[Apache-2.0](https://github.com/vercel/ai/blob/main/LICENSE)，[官方仓库](https://github.com/vercel/ai) | 首选基础接入；沿用 React/Vite/Fastify，不要求改为 Next.js 或使用其付费 Gateway |
| CopilotKit | 工具交互、上下文、人工交互 UI；[MIT](https://github.com/CopilotKit/CopilotKit/blob/main/LICENSE)，[hooks](https://docs.copilotkit.ai/google-adk/concepts/which-hook) | 借鉴/验证助手卡片与等待确认；当前少量固定操作先用自有 UI。[Intelligence](https://docs.copilotkit.ai/strands/intelligence/intelligence-platform) 是单独平台，不能与 SDK 许可混同 |
| Tambo | 注册 React 组件与 schema，agent 选择并更新组件；根目录[MIT](https://github.com/tambo-ai/tambo/blob/main/LICENSE)，API 子项目[Apache-2.0](https://github.com/tambo-ai/tambo/blob/main/apps/api/LICENSE) | 适合动态生成界面；Master 需要稳定地图与任务数据，不引入第二个状态权威。[自部署说明](https://docs.tambo.co/guides/self-hosting)包含管理台/API/数据库，不是零后端组件 |
| LangGraph JS | 状态图、持久流程、中断恢复；[MIT](https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE)，[概览](https://docs.langchain.com/oss/javascript/langgraph/overview) | 长任务跨会话恢复出现时再考虑；首版有限状态机足够。恢复可能重跑节点，仍需业务幂等。[interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) |
| Task Master | PRD 拆任务、依赖、子任务、下一步，偏 AI 开发流程；[仓库](https://github.com/eyaltoledano/claude-task-master) | 研究拆解与增量任务机制，不直接嵌入商业 Master 核心。实际为 [MIT + Commons Clause](https://github.com/eyaltoledano/claude-task-master/blob/main/LICENSE)，维护者[许可解释](https://github.com/eyaltoledano/claude-task-master/blob/main/docs/licensing.md)另明确竞争产品限制 |
| Khoj | 用选定笔记/文档对话并引用来源；语音转文字可修改；[聊天](https://docs.khoj.dev/features/chat/)、[语音](https://docs.khoj.dev/features/voice-chat/)、[AGPL-3.0](https://github.com/khoj-ai/khoj/blob/master/LICENSE) | 最值得借鉴“自己的资料＋可检查来源＋语音纠错”；不能据此认为其已有 Master 的目标图谱/时间账本 |
| SiYuan 思源 | 块引用、知识组织、AI 写作问答与 API；[README](https://github.com/siyuan-note/siyuan/blob/master/README.md)、[AGPL-3.0](https://github.com/siyuan-note/siyuan/blob/master/LICENSE) | 借鉴稳定片段 ID 和来源定位；不整仓移植，不把问答等同于自动落地计划 |
| Logseq / logseq-openai | 核心[AGPL-3.0](https://github.com/logseq/logseq/blob/master/LICENSE.md)；[社区插件](https://github.com/briansunter/logseq-openai)支持选块上下文、预览/替换与音频转写入口 | 参考小范围上下文、局部生成与修改。插件 README 标 MIT，但本轮独立 LICENSE 抓取未成功，采用前再核；部分模型描述较旧，不当作官方最新方案 |
| Notion AI Meeting Notes | 摘要/行动项、转写引用与定位；[官方说明](https://www.notion.com/help/ai-meeting-notes) | 只借鉴“结论旁就能查证据”，不复制商业代码/素材，也不把会议录音扩成 Master 首版需求 |
| whisper.cpp | C/C++ 本地 ASR，支持 Windows/CPU 等；[仓库](https://github.com/ggml-org/whisper.cpp)标 MIT | 离线语音的后续候选，不等于小设备都快速；需核模型许可、下载包体和中文质量，首版不假定离线语音已成立 |

Task Master 的 Commons Clause 针对收费提供且主要价值来源于该软件功能的产品/服务存在限制，不能只看到 MIT 字样就拿来搭建本产品。采用前应针对实际使用方式取得适当授权评估；本方案选择流程借鉴、不移植其引擎。

## 3. 语音路线与智能体框架的分工

| 路线 | 好处 | 代价 | 本次建议 |
| --- | --- | --- | --- |
| 流式 ASR → 文本 agent → 短 TTS | 转写可校正；与文字/导入共用逻辑；可分别替换中文识别/模型/音色 | 三阶段延迟相加，需合理端点检测 | 首版默认候选，实际录音与追问闭环必须完成 |
| 端到端 Realtime/全双工方案 | 更自然的话轮、插话与声学交互能力 | 语音与工具确认同步更复杂，供应商/费用/字幕行为要验证 | 并行小型实验，以中文准确与真实时延决定是否替换语音层 |
| 本地 ASR + 本地/云 agent | 可减少音频外发，断网能力可分层设计 | 模型下载、CPU/内存、中文质量与跨端成本 | 可选后续；不能为隐私宣传虚构已落地能力 |

官方 OpenAI 语音文档区分链式、Realtime 与其他全双工架构；链式允许检查中间文本。Realtime 客户端可用受限临时凭证接入，而不是把长期 key 放浏览器。本项目据此把语音层与业务确认分离，不锁定其模型。[架构说明](https://developers.openai.com/api/docs/guides/voice-agents)、[Realtime 入门](https://developers.openai.com/api/docs/guides/realtime)

中国大陆优先仍是待确认市场假设，候选需覆盖实际目标网络。阿里官方提供[实时 ASR](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)、[实时 TTS](https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide)、[Omni Realtime](https://help.aliyun.com/zh/model-studio/realtime)文档，可纳入中文方案对照；本轮没有实测、开户或调用。具体型号的热词、时间戳、工具调用和地区凭证不同，不能混用系列能力；其文档明确部分实时 ASR 型号不返回时间戳。

AI SDK 不负责麦克风采集，也不替 Master 保存可靠任务。官方[结构化输出说明](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)明确 partial 对象未满足最终 schema；只能用来显示草稿。取消与跨刷新续流也不是可随意叠加的默认保证，需独立协议处理。[停止流](https://ai-sdk.dev/docs/advanced/stopping-streams)、[恢复限制](https://ai-sdk.dev/docs/troubleshooting/abort-breaks-resumable-streams)

不预定具体模型名字或价格。选择依据是中文关键字段准确率、适用地区、schema/工具支持、实际时延、上下文政策与每个有效计划成本。研究本身不需 API key；后续真实调用需确定供应商与凭证配置。

## 4. 一个完整且低负担的对话示例

以下是设计示例，不是已执行结果。假设用户时区为 Asia/Singapore，现场对话日期为 2026-09-28。

用户语音：“我昨天把导入界面写好了，测试还没过。周五要演示，今天只有一小时，帮我安排一下。”

Master：“周五是要完整导入跑通，还是只展示界面？”

用户：“完整导入跑通，先不做同步。”

Master 展示并可简短播报：

- 目标草稿：2026-10-02 演示完整导入流程；“不做同步”记录为本阶段范围限制。
- 昨日进展：导入界面已写好，来源为用户自述；测试尚未通过，不宣称功能已验收。
- 今日建议：复现失败并确认原因 20 分钟，修复一个关键阻塞 25 分钟。以上是估时与建议，不是实际投入，也不保证当天全部修好。
- 60 分钟可用时间按默认 20% 缓冲得到 48 分钟可计划容量，本次建议 45 分钟；保留 15 分钟未安排。
- 地图只补“导入流程”相关分支与下一行动；不为凑齐 3–7 个要素编造健康/营销等无关分支。

用户：“第二项先只安排十五分钟，按这版安排。”

Master 将第二项改为 15 分钟。此处指向唯一、只涉及用户明确的低风险时长修改，且有显式“按这版安排”，可在校验后一次保存并复述最终差异，不必机械再问。授权绑定原展示版本、用户明确修改与最终结果；如果识别不确定、期间草案已变，或模型新增了用户没有批准的内容，则给新预览确认。

提交完成后回答：“已安排到今天，共 35 分钟；测试仍标记为待通过。”今日、地图和周计划引用同一批任务，提供撤销。用户直接手改也始终有效。

该示例体现的是关键追问与可靠落地，不要求每个场景一定提问。信息已足够就直接给草案；没有可用时长时可以先给优先队列，不能自行假设用户拥有八小时。

## 5. 从 Codex/聊天记录获取信息的三条路径

| 路径 | 阶段 | 用户负担与限制 |
| --- | --- | --- |
| 粘贴选段 / 选择文本文件 | M1 | 最通用；只分析选中范围，保留说话人与原时间；无需连接全部历史 |
| Codex 只读连接器 | M2 独立验证 | 用户选会话/日期→预览→发送；官方有列出/读取接口，但不同客户端和存储类型能读哪些内容需要实际验证 |
| Master MCP/插件主动接收 | 后续 | 用户在开发助手中要求“把这次进展发给 Master”；只提交摘要/证据和草案，不必反复搬整段日志 |

官方 Codex App Server 提供 `thread/list`、`thread/read`；后者用于读取已存对话而不恢复运行。某些历史分页能力仍标实验性，不能保证覆盖所有客户端/云端记录。本项目优先验证受控本地 stdio，只读接口；Web 版使用用户选文件或明确安装的桥接，不扫描本机私有目录。[官方 App Server](https://learn.chatgpt.com/docs/app-server)

官方 MCP/插件指南已有工具驱动待办示例，证明这一集成方向有可研究的接口，但“Master 插件”尚不存在；它需要本项目实现并做授权/防重放/确认等验证。[官方待办示例](https://developers.openai.com/plugins/build/app-quickstart)

本轮仅研究以上方式，没有读取用户真实 Codex 历史、安装插件或发送用户记录。

## 6. 可靠性不是增加一套繁琐审批

正常路径只需一次批量确认，可通过语音；每条事实不用弹一个窗口。存在歧义的少数条目单独留待核实，其余内容可以形成可采纳子集。

必须有的六个区分：

1. 事实与建议：可以建议下一步，不能捏造过去完成或实际工时。
2. 用户自述与助手宣称：保留来源，不能把聊天助手说“已修好”当作测试或上线的证据。
3. 正式任务与草案：生成中不改变进度，确认后再事务提交。
4. 人工修改与 AI 推断：重生成只影响选定范围，人工修正/锁定不静默覆盖。
5. 音频发送、文本推理、自动导入与同步：分别授权，不靠一个“开启云功能”全包。
6. 停止生成与撤销提交：停止不会回滚已经保存的数据；撤销有明确作用范围和版本检查。

来源显示紧邻结果但默认收起细节；点一下直接定位片段。生成地图用草案叠层，不每个 token 重排正式地图。会话结束后回到行动视图，聊天记录不持续占据主要工作空间。

对于音频，要明确“云端识别收到声音后才能转写”：不能把文本日志脱敏能力包装成云语音也可在发送前消除所有敏感信息。默认不保存录音，界面显示真实收音状态，关闭会话释放设备。

## 7. 应先验证的产品价值和技术风险

M0 先做三条可操作样板：语音创建今日计划；选定开发记录整理进展；语音纠正已生成提案并保存/撤销。不能只用预制任务或假字幕演示就宣布 AI/语音已实现。

省时实验计入“说话＋听问题＋读结果＋纠错＋确认”的总主动维护时间，另报系统等待和端到端耗时，和等难度手工方案对照。初始目标是中位维护时间减少 30%，5–10 条事项的每日整理尽量在 90 秒左右完成；这些是待验证方向，不是已达成指标。任务成功率、错记完成率与用户纠错次数必须一起报告，不能用少点击掩盖错误安排。

技术先测：中文日期/否定/数字、中英混说、噪声、旧日志相对日期、跨段矛盾、重复导入、手改保护、取消晚到、断网与权限拒绝。原始日志的“明天”按消息时间与时区解析，时间未知就保留待确认，不按导入当天推断。

性能分别测可见收音反馈、最终字幕、首个有用追问、完整可应用提案、本地事务回执；详细暂定门槛见技术文档 15.10。首个字出现不代表已经排好工作。正式界面编辑/拖拽不等待云端 AI。

商业验证重点从“是否喜欢图谱颜值”扩展为“是否持续减少维护时间、是否愿意为可信整理和语音便利付费”。成本分 ASR 分钟、TTS、模型输入输出、重试/失败与存储；不在未核成本时承诺无限 AI。用完额度后已保存任务仍可查看、手改和导出。

## 8. 本轮决策与未决项

- 已确认：语音优先；AI 可主动关键追问；聊天后生成并安排真实任务；记录导入；手动修改不可缺；Windows + Web 首发；自然审美与流畅操作。
- 推荐：AI SDK + 自有有界 agent；首版链式语音；一次批量确认、完整撤销；AI 网关 M1、工作区同步 M3；基于来源的增量草案而不是整库重写。
- 仍待确认的上层选择：个人/团队、中国大陆/全球首发。具体模型与云语音供应商在市场确定与真实小样本测试后选，不因文档提及某厂商就默认已授权采购或上传。
- 当前未做：代码重构、真实录音、模型调用、私人日志读取、框架安装、发布/部署。下一步应先验证核心对话闭环，而不是先完成所有装饰页面再接 AI。
