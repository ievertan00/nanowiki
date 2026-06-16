# 模板使用指南

## Persona 与 Structure 是什么？

**Persona（思维人格）** — 塑造 LLM 第一遍回答的*思维方式*（例如：逆向推理、审查证据、量化风险）。以 `PERSONA:` 块注入系统提示。

**Structure（聚焦结构）** — 提供第一遍回答应覆盖的*方面清单*（例如：SWOT 各象限、AARRR 漏斗、价值链各环节）。以 `FOCUS AREAS:` 块注入。

两者均只作用于第一遍（pass-1）的自由作答阶段，不影响格式化（pass-2）。

## CLI 用法

```powershell
wiki ask "问题" --persona <名称> --structure <名称>
wiki ingest <文件>  --persona <名称> --structure <名称>
```

`<名称>` 为文件名（不含 `.md`），支持模糊匹配（如 `feynman` 可匹配 `feynman-explainer`）。名称无法解析时，在任何 LLM 调用前即报错退出。

---

## Personas 一览

| 名称 | 适用场景 |
|---|---|
| `feynman-explainer` | 向零基础读者解释一个概念 |
| `first-principles` | 剥离假设，从不可再分的基本事实重新推导结论 |
| `occams-razor` | 选择假设最少的充分解释，暴露多余假设 |
| `socratic` | 追问定义，揭示未言明的前提与矛盾 |
| `five-whys` | 通过逐层"为什么"追问诊断问题根因 |
| `analogical` | 在不同领域间寻找结构相似性，迁移解法、发散思路 |
| `second-order` | 快速连锁后果分析——"然后呢？"重复 2–3 层 |
| `systems-thinking` | 完整反馈回路建模：存量/流量、杠杆点、政策阻力 |
| `inversion` | 规划阶段：先列"绝对不能发生的事"，反推正确路径 |
| `red-team` | 批判阶段：对已有结论构造最强反驳 |
| `expected-value` | 以概率 × 结果量化决策；标注非线性风险 |
| `opportunity-cost` | 用"放弃的最优替代方案"衡量每个选择 |
| `research-reviewer` | 审查学术/ML 论文：方法论、基线、消融实验、可复现性 |
| `skeptical-reviewer` | 审查任意论断：证据质量、事实 vs 推论、利益冲突 |
| `investor-decisionmaker` | 将分析转化为可执行的风险/回报判断，明确时间维度 |

---

## Structures 一览

| 名称 | 适用场景 |
|---|---|
| `concept-deep-dive` | 抽象概念：直觉与动机 → 形式定义 → 推导 → 误区 → 延伸 |
| `technology-deepdive` | 具体技术：原理 → 架构 → 性能 → 替代方案 → 生态 |
| `reading-notes` | 通用书籍/论文：核心论点、证据、局限、实践启示 |
| `ml-paper-notes` | ML/CS 论文：架构细节、实验设置、消融分析、对已有笔记的影响 |
| `industry-research-report` | 完整行业研究（PEST → 市场规模 → 产业链 → 竞争 → 趋势 → 风险）|
| `company-competitor-deepdive` | 单一公司：商业模式、财务、团队、SWOT、战略路线图 |
| `swot` | 优势/劣势/机会/威胁 + 交叉策略（SO/WO/ST/WT） |
| `five-forces` | 竞争结构：现有竞争/新进入者/替代品/供方/买方议价 |
| `pest` | 宏观环境：政治/经济/社会/技术/环境/法律 |
| `value-chain` | 活动分解：主要活动 → 支持活动 → 利润空间 |
| `3c` | 战略交集：公司 / 客户 / 竞争者 |
| `business-model-canvas` | 商业模式画布：价值主张、渠道、收入、成本、合作 |
| `jtbd` | 用户任务：核心任务、触发情境、现有替代、衡量标准、阻力 |
| `aarrr` | 漏斗指标：获取 / 激活 / 留存 / 收入 / 推荐 |
| `mece` | 逻辑分解：相互独立、完全穷尽 |
| `iteration-loop` | 过程节奏：PDCA（质量改进）/ OODA（快速响应） |

---

## 搭配指南

### 避免同时使用（造成重复）

| Persona | Structure | 原因 |
|---|---|---|
| `red-team` 或 `inversion` | `swot` | SWOT 的"威胁/劣势"象限已输出失败模式 |
| `research-reviewer` | `ml-paper-notes` | 论文笔记结构已含消融与局限性章节 |
| `skeptical-reviewer` | `reading-notes` | 阅读笔记结构已内置批判性评估章节 |
| `investor-decisionmaker` | `industry-research-report` | 行研报告结论部分已包含投资者视角 |

### 推荐搭配

| Persona | Structure | 效果 |
|---|---|---|
| `investor-decisionmaker` | `five-forces` / `3c` / `swot` | Persona 提供决策框架，Structure 提供分析支架 |
| `first-principles` | `mece` | 第一性原理负责拆解，MECE 确保拆解完全穷尽 |
| `expected-value` | `industry-research-report` | 为报告的定性风险/机会章节补充概率加权量化 |
| `socratic` | `concept-deep-dive` | 苏格拉底追问自然浮现"常见误区"章节所要揭示的内容 |
| `analogical` | `concept-deep-dive` | "与已有概念的关系"章节是类比迁移输出的天然载体 |
| `second-order` 或 `systems-thinking` | `value-chain` | 沿价值链各环节追踪间接效应 |

### 涌现组合（单独使用均达不到的效果）

| 组合 | 产出 |
|---|---|
| `red-team` + `business-model-canvas` | 逐格攻击画布——揭示竞争对手可利用的假设薄弱点 |
| `inversion` + `jtbd` | "什么会让用户不选这个方案？"——暴露正向 JTBD 视角忽视的阻力 |
| `second-order` + `aarrr` | 漏斗各层的连锁扭曲效应（如廉价获客拉高流失率） |
| `systems-thinking` + `industry-research-report` | 为静态行业快照引入反馈回路动态分析 |
| `opportunity-cost` + `value-chain` | 基于资源最优替代用途，逐环节判断自营 vs 外包 |

---

## 相关 Persona 对照

`second-order` ↔ `systems-thinking`：覆盖同一领域，深度不同。快速追问"然后呢？"用 `second-order`；涉及反馈回路、存量/流量与杠杆点时用 `systems-thinking`。

`inversion` ↔ `red-team`：互补的两个阶段。尚未确定路径时用 `inversion`；已有结论需要压力测试时用 `red-team`。

`research-reviewer` ↔ `skeptical-reviewer`：相同的批判立场，不同的适用范围。`research-reviewer` 针对实证/技术论文（实验、基线、可复现性）；`skeptical-reviewer` 适用于任意论断或声明。

---

## 创建自己的模板

内置的 Persona 和 Structure 均为示例，是起点而非限制。在对应目录下新建一个 Markdown 文件即可添加自定义模板：

- `templates/personas/<名称>.md` — 写下你常用的某种思维方式的指令
- `templates/structures/<名称>.md` — 写下你每次都希望覆盖的方面清单

无需注册或重启，文件创建后立即可通过 `--persona <名称>` 或 `--structure <名称>` 调用，模糊匹配同样适用。

编写模板的几条建议：

- **Persona** 应聚焦于*如何思考*——推理的视角，而非主题本身。保持在 4–6 条要点以内，让 LLM 内化立场而不是被指令淹没。
- **Structure** 应是方面清单，而非完整文段。LLM 负责填写内容，Structure 只需确保不遗漏重要维度。
- 内置模板可以自由编辑或删除。`wiki init` 只在文件不存在时才写入默认内容，你的自定义内容永远不会被覆盖。
