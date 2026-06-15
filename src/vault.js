import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRS = ['sources', 'notes', 'moc', 'meta', 'templates/personas', 'templates/structures'];
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_TEMPLATES = {
  'personas/skeptical-reviewer.md': `以一名挑剔、要求证据的审稿人视角作答：

* 对每一个关键论断，主动追问"证据是什么"、"样本/数据是否足够"、"是否存在选择性引用"。
* 明确区分"已证实的事实"、"作者的推论"和"未经验证的猜测"，三者不可混淆。
* 主动指出可能的利益冲突、研究局限、方法缺陷，即使原始来源未提及。
* 对过于绝对或缺乏限定条件的结论，标注该结论的适用边界。
* 语气审慎、克制，不夸大也不轻易否定，但绝不回避指出弱点。`,

  'personas/beginner-explainer.md': `假设读者第一次接触这个主题，按照"新手友好"的方式作答：

* 先给出一句话的整体定位（这是什么、为什么重要），再逐步展开。
* 遇到专业术语或缩写时，第一次出现必须给出简明解释，不能假设读者已经知道。
* 多用类比和具体例子，把抽象概念落到可感知的场景。
* 按照"由浅入深"的顺序组织内容：先讲核心概念，再讲细节和边缘情况。
* 在适当的地方提示后续可以深入了解的方向，为进一步学习指路。`,

  'personas/investor-decisionmaker.md': `以投资者/决策者的视角作答，关注"这对决策意味着什么"：

* 每一段分析尽量落到机会、风险、所需行动或决策影响上，而不是停留在纯描述。
* 明确标注时间维度：短期（影响当下决策）vs 中长期（影响战略方向）。
* 对关键不确定性，说明如果该假设被证明错误，结论会如何变化。
* 在合适的地方给出风险收益的定性判断（如：高风险高回报 / 稳健但增长有限）。
* 避免空泛的"值得关注"之类表述，尽量给出可执行的下一步（如：需要进一步验证的数据、需要观察的指标、需要等待的事件）。`,

  'personas/systems-architect.md': `You are a pragmatic, veteran Principal Systems Architect.
When answering or summarizing:
- Focus heavily on operational constraints, scalability bottlenecks, and failure modes.
- Look at security implications (threat vectors, data boundaries).
- Keep descriptions dry, technical, and concrete.
- Prioritize real-world engineering trade-offs (e.g., maintenance overhead vs. performance gains) over theoretical ideals.`,

  'personas/feynman-tutor.md': `You are an expert tutor who explains complex concepts using the Feynman Technique.
- Break down jargon into plain, clear language.
- Use intuitive, real-world analogies to ground abstract concepts.
- Explain the "why" before the "how."
- Keep the tone encouraging, clear, and accessible, without sounding condescending.`,

  'personas/first-principles.md': `以"第一性原理"（First Principles）的思维方式作答：拒绝类比与经验主义，把问题拆解到最基本、不可再分的事实，再从这些事实重新推导结论。

* 先识别并剥离假设：明确区分"被默认为真的惯例 / 类比 / 权威观点"与"真正不可再分的基本事实（物理定律、数学关系、定义、可验证的数据）"。
* 对每个关键结论持续追问"为什么"，直到抵达无法再被简化的底层事实，而不是停留在"行业一向如此"。
* 从底层事实自下而上重新推导，而非从既有方案或同类产品类推；若推导结果与主流做法冲突，如实指出冲突点及其原因。
* 揭示"这件事被认为必须如此"的真实约束来源：区分物理 / 逻辑的硬约束，与历史路径、成本习惯、监管或心理惯性造成的软约束。
* 在合适处给出"若从零开始、不受现有方案束缚，最优解会是什么"的重构视角。`,

  'personas/inversion.md': `以"逆向思维"（Inversion）作答：不直接求解"如何成功 / 如何做对"，而是先问"什么会导致失败 / 做错"，再从规避这些失败反推路径。

* 先列出"要达成目标，绝对不能发生的事、最容易翻车的地方"，把避免它们作为首要约束。
* 对每个看似显然的目标，反过来设想"如果要把它彻底搞砸，该怎么做"，从中识别真实风险。
* 优先消除致命错误与负面因素，而非一味叠加正面举措——少犯错往往比多做对更关键。
* 在结论处给出"为避免最坏情况应坚守的底线"，而不仅是"理想路径"。`,

  'personas/occams-razor.md': `以"奥卡姆剃刀"（Occam's Razor）作答：在所有能解释现象的假设中，优先选择假设最少、最简单的那个。

* 面对一个现象或问题，先列出可能的解释，再按"引入的假设数量 / 复杂度"排序。
* 警惕需要叠加多个巧合或特殊条件才成立的解释，优先质疑它们。
* 简单解释已足够时，不引入额外的实体、机制或阴谋；只有当简单解释确实无法覆盖证据时，才升级到更复杂的假设。
* 明确指出当前结论"为成立所必须依赖的假设"，并提示哪些假设最薄弱、最该被检验。`,

  'personas/five-whys.md': `以"5 Whys / 根因分析"作答：对问题连续追问"为什么"，穿透表面症状，直到触及可干预的根本原因。

* 从表象问题出发，逐层追问"为什么会这样"，每一层的答案都成为下一个"为什么"的对象，通常需追问 3–5 层。
* 区分"症状"（表面可见的现象）与"根因"（消除后问题不再复发的底层原因），不停留在第一层解释。
* 警惕把"人为疏忽"当作终点——继续追问"为什么这个疏忽会发生 / 没被拦住"，指向流程或系统层面的原因。
* 在结论处给出"针对根因（而非症状）的对策"，并说明该对策为何能阻止问题复发。`,

  'personas/opportunity-cost.md': `以"机会成本"思维作答：任何选择都用"为此放弃的最优替代方案"来衡量，逼出被忽略的隐性代价。

* 对每个方案 / 建议，主动追问"选了它，就等于放弃了什么"——时间、资金、注意力的下一个最佳用途。
* 不只看某选项的绝对收益，而是比较它与次优选项之间的差额收益。
* 提示沉没成本不应影响当下决策——已付出的不可回收成本不是继续的理由。
* 在结论处给出"相对于最优替代方案，该选择是否仍然值得"的判断，而非孤立地说"它有好处"。`,

  'personas/second-order.md': `以"二阶思维"（Second-Order Thinking）作答：不止看直接后果，持续追问"然后呢？"，推演连锁反应与长期影响。

* 对每个行动或结论，先列出一阶（直接、即时）后果，再推演二阶、三阶（间接、延迟、连锁）后果。
* 警惕"短期有利、长期有害"或"对局部有利、对整体有害"的方案，主动标注这类时间 / 范围错配。
* 考虑他人或系统对该行动的反应，以及这些反应又会引发什么——后果常因反馈而被放大或反转。
* 在结论处区分"一阶看起来如何"与"把长期连锁后果计入后如何"，二者不一致时如实指出。`,

  'personas/expected-value.md': `以"期望值 / 成本收益"思维作答：把判断尽量落到"概率 × 结果"的量化估算上，而非凭感觉。

* 对不确定的结论，显式估计各种结果发生的概率及其量级（即便只是粗略区间），再加权比较。
* 区分"高概率小收益"与"低概率大收益（或大损失）"，并提示哪类风险不可承受（即便期望值为正也应规避）。
* 标注估算所依赖的关键假设与数据来源，说明哪个变量对结论最敏感。
* 在结论处给出基于期望值的取舍建议，而非笼统的"利大于弊"。`,

  'personas/socratic.md': `以"苏格拉底式提问"（Socratic）作答：不急于给结论，而是通过层层提问，逼出隐含的定义、前提与矛盾。

* 先澄清关键概念的定义——追问"你说的 X 究竟指什么"，避免在含混的术语上推理。
* 对每个论断追问其前提与证据："凭什么这么说""有什么支撑""反例是什么"。
* 主动暴露论证中的张力与自相矛盾之处，引导得出更经得起追问的结论。
* 在适当处以问题（而非断言）推进，把"读者需要自行思考的关键问题"明确列出。`,

  'personas/red-team.md': `以"红队 / 魔鬼代言人"（Red Team）视角作答：主动站在对立面，对当前结论发起最强攻击，找出它最可能崩溃的地方。

* 先复述待检验的结论，再系统性地构造针对它的最强反驳，而非稻草人式的弱反驳。
* 主动寻找反例、边界情况、被忽略的前提，以及"在什么条件下该结论会彻底失效"。
* 设想对手 / 竞争者会如何利用该方案的弱点，以及最坏情况下会发生什么。
* 在结论处给出"该结论要站得住，必须先回应哪些质疑"，而非简单背书。`,

  'personas/systems-thinking.md': `以"系统思维"（Systems Thinking）作答：关注要素之间的反馈回路、存量与流量、时滞与杠杆点，而非孤立的线性因果。

* 不把问题看成单一原因 → 单一结果，而是识别相互作用的要素及其反馈回路（增强回路 vs 调节回路）。
* 关注存量与流量、时滞效应——原因与结果常在时间和空间上分离，短期与长期表现可能相反。
* 寻找高杠杆干预点（小投入撬动大改变），并警惕"治标"式干预带来的政策阻力或问题转移。
* 在结论处描述系统的整体行为模式与可能的非预期后果，而非只罗列局部因素。`,

  'personas/analogical.md': `以"类比迁移"思维作答：通过在不同领域间寻找结构相似性，把已知领域的解法迁移到当前问题，用于发散与启发。

* 主动寻找"这个问题在结构上像什么"——其他行业、自然界、历史中是否存在同构的问题及其成熟解法。
* 抽取类比的底层结构（关系、约束、机制），而非表面相似，再迁移到当前情境。
* 明确指出类比的适用边界：哪些结构对应成立、哪些地方会失效，避免生搬硬套。
* 用类比生成多个候选思路供后续筛选，而非锁定单一答案。`,

  'structures/api-eval.md': `- **Developer Experience (DX):** Setup friction, quality of docs, type safety.
- **Performance:** Runtime overhead, memory usage, latency profiles, dependency footprint.
- **Ecosystem Fit:** Versioning frequency, community support, ease of testing/mocking.
- **Alternatives:** How it compares directly to the leading industry standard.`,

  'structures/system-design.md': `- **Bottlenecks:** Network, disk I/O, or CPU limits; scaling limitations.
- **State & Storage:** Database choices, consistency guarantees, cache-invalidation strategies.
- **Failover:** What happens if a node or region goes down?
- **Trade-offs:** Which coordinates of the CAP theorem, cost, or complexity were sacrificed?`,

  'structures/paper-summary.md': `- **Core Hypothesis:** The exact problem statement and proposed solution.
- **Methodology Summary:** How they tested it, variables controlled, and metrics measured.
- **Key Benchmarks:** Exact percentage improvements, speeds, or parameters.
- **Limitations:** Self-admitted or obvious flaws in the research or implementation.`,

  'structures/company-competitor-deepdive.md': `## 公司概况

* 成立时间、所在地、规模（员工数、营收量级）
* 主营业务与产品线
* 股权结构与控制人
* 发展历程中的关键里程碑

## 商业模式

* 收入构成与占比
* 成本结构与毛利率
* 客户结构（B端/C端、集中度）
* 定价策略与变现方式

## 产品与技术

* 核心产品/服务的竞争力来源
* 技术壁垒与专利布局
* 产品迭代节奏与路线图

## 市场地位与竞争格局

* 市场份额与排名
* 主要竞争对手及其差异化
* 与竞品的对比表格（产品、价格、渠道、用户规模）

## 财务表现

* 营收、利润、增长率（近3年趋势）
* 现金流状况与融资历史
* 估值水平（如有公开数据，标注来源；否则标注"估算"并说明依据）

## 团队与治理

* 创始人/管理层背景
* 组织文化与人才策略
* 治理结构中的潜在风险点

## SWOT分析

* 优势（Strengths）
* 劣势（Weaknesses）
* 机会（Opportunities）
* 威胁（Threats）

## 风险与不确定性

* 经营风险、法律合规风险、技术风险、市场风险
* 评估影响程度：高 / 中 / 低

## 近期动态与展望

* 最近6-12个月的重大事件（融资、并购、产品发布、人事变动）
* 未来1-3年的关键看点与判断依据`,

  'structures/industry-research-report.md': `# 一、执行摘要（Executive Summary）

包括：

* 行业现状概述
* 核心发现
* 关键数据
* 未来趋势判断
* 主要机会与风险

要求：用500字以内总结整份报告。

---

# 二、行业概况

## 2.1 行业定义

说明：

* 行业边界
* 主要产品与服务
* 行业分类标准
* 上下游关系

## 2.2 行业发展历程

分析：

* 萌芽期
* 成长期
* 成熟期
* 当前所处阶段

## 2.3 行业价值链

识别上游、中游、下游，分析各环节价值分布。

---

# 三、宏观环境分析（PEST）

## 政策（Policy）

分析：国家政策、监管环境、产业扶持政策、行业准入门槛

## 经济（Economic）

分析：GDP影响、消费能力变化、利率环境、宏观经济周期影响

## 社会（Social）

分析：人口结构变化、消费习惯变化、社会需求变化

## 技术（Technology）

分析：技术演进路线、核心技术壁垒、技术替代风险

---

# 四、市场规模分析

## 当前市场规模

输出：市场规模、增长率、历史变化趋势

## TAM / SAM / SOM分析

分别估算总市场规模（TAM）、可服务市场（SAM）、可获取市场（SOM），明确假设依据。

## 市场增长驱动因素

分析：政策驱动、技术驱动、用户需求驱动、商业模式驱动

---

# 五、产业链分析

## 上游

分析：核心资源、供应商格局、议价能力

## 中游

分析：主要企业、行业集中度、盈利模式

## 下游

分析：客户类型、采购逻辑、需求变化趋势

识别产业链关键利润环节。

---

# 六、竞争格局分析

## 市场结构

判断：完全竞争 / 垄断竞争 / 寡头竞争 / 垄断市场

## 市场集中度

分析：CR3、CR5、CR10

## 主要企业分析

对于TOP企业分别分析：公司简介、市场份额、产品结构、核心优势、核心风险、财务表现、战略方向。输出对比表格。

---

# 七、商业模式分析

分析行业主要盈利模式：收入来源、成本结构、利润来源、关键成功因素。分析行业价值创造逻辑。

---

# 八、用户需求分析

识别：核心用户群体、用户画像、用户痛点、用户决策逻辑。分析未来需求变化趋势。

---

# 九、行业趋势分析

从以下维度分析：技术趋势、产品趋势、商业模式趋势、竞争趋势、政策趋势。预测未来3年、5年、10年行业发展方向。

---

# 十、风险分析

包括：政策风险、技术风险、市场风险、竞争风险、替代风险。评估影响程度：高 / 中 / 低。

---

# 十一、机会分析

识别：增量市场、新兴赛道、技术变革机会、商业模式创新机会。说明机会形成原因。

---

# 十二、结论与建议

分别从企业经营者视角、创业者视角、投资者视角提出具体建议。

---

输出要求：

1. 使用咨询公司（麦肯锡、贝恩、BCG）、券商研究所及投资机构的研究风格写作。
2. 优先使用数据和事实支撑观点。
3. 明确区分事实、推论和预测。
4. 每个结论必须给出依据。
5. 使用表格呈现关键数据。
6. 使用 SWOT、PEST、波特五力模型等经典框架。
7. 最后给出未来三年行业展望及关键判断。
8. 若缺少真实数据，请明确标注"估算"并说明估算逻辑。`,

  'structures/paper-book-summary.md': `## 基本信息

* 作者、发表时间/出版年份、来源（期刊/会议/出版社）
* 研究领域与所属学术脉络

## 核心论点/主张

* 作者试图回答的问题或证明的论点
* 主要结论一句话概括

## 研究方法

* 采用的方法、数据来源、样本规模
* 方法本身的优势与局限

## 关键发现与证据

* 支撑论点的核心数据/案例
* 区分"作者声称的事实"与"作者的推论"

## 与既有知识的关系

* 这项工作如何延续、修正或反驳已有研究
* 与本知识库中已有笔记的关联点

## 局限性与批判性评估

* 作者自述的局限
* 你认为未被充分讨论的弱点（方法、样本、推广性等）

## 实践启示

* 对实际工作/决策有何指导意义
* 若结论被采纳，会改变什么

## 延伸问题

* 这项工作引出的、值得进一步研究的问题`,

  'structures/technology-deepdive.md': `## 技术原理

* 核心工作机制与关键概念
* 与相关/前驱技术的区别

## 技术架构

* 系统组成与关键模块
* 依赖的基础设施或前置条件

## 性能与基准

* 关键性能指标（速度、精度、成本、能耗等）
* 与替代方案对比数据（标注数据来源；数据缺失时标注"估算"并说明依据）

## 成熟度与应用现状

* 当前所处发展阶段（研究/原型/早期应用/规模化）
* 已落地的典型应用场景与案例

## 替代方案与竞争技术

* 主要竞品技术及其优劣势
* 选型决策的关键权衡因素

## 局限性与开放问题

* 当前已知的技术瓶颈
* 尚未解决的关键问题

## 生态与社区

* 主要参与者（公司、开源项目、标准组织）
* 工具链与开发者生态成熟度

## 发展趋势与路线图

* 短期（1年内）、中期（1-3年）、长期（3年以上）的演进方向
* 可能引发范式转变的因素`
};

export function initVault(wikiPath, config = {}) {
  for (const dir of DIRS) {
    const fullPath = path.join(wikiPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Seed default templates. Idempotent — existing templates are never overwritten.
  for (const [relPath, content] of Object.entries(DEFAULT_TEMPLATES)) {
    const fullPath = path.join(wikiPath, 'templates', relPath);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content);
    }
  }

  // Seed config + schema doc on first use. Idempotent — existing files are never
  // overwritten, so the human's edits and the live taxonomy are preserved.
  const configPath = path.join(wikiPath, 'wiki-config.json');
  if (!fs.existsSync(configPath)) {
    const defaults = { language: config.language || 'zh', domains: {} };
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2));
  }

  const wikiFile = path.join(wikiPath, 'WIKI.md');
  if (!fs.existsSync(wikiFile)) {
    // The CLI's own copy of the template; each skill folder ships its own copy too
    // (kept in sync by hand) so they stay self-contained for `npx add-skill`.
    const template = path.join(moduleDir, 'WIKI.template.md');
    if (fs.existsSync(template)) fs.copyFileSync(template, wikiFile);
  }
}

export function getVaultFiles(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return [];
  return fs.readdirSync(notesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.basename(f, '.md'));
}

export function appendLog(wikiPath, operation, title, details = []) {
  const logPath = path.join(wikiPath, 'meta', 'log.md');
  const date = new Date().toISOString().slice(0, 10);
  const detailBlock = details.length ? details.map(d => `- ${d}`).join('\n') + '\n\n' : '';
  const entry = `## [${date}] ${operation} | ${title}\n\n${detailBlock}`;
  fs.appendFileSync(logPath, entry);
}
