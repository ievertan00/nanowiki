export const VAULT_PROFILES = {
  reading: {
    name: 'reading',
    label: 'Book Reading',
    description: 'Book reading, chapter digestion, quote capture, and idea extraction.',
    aliases: ['book', 'books', 'read', 'book-reading'],
    dirs: ['sources/books', 'templates/commands', 'templates/skills', 'meta/reading'],
    domains: {
      reading: ['books', 'authors', 'concepts', 'quotes', 'reading-questions'],
    },
    templates: {
      'personas/book-critic.md': `以"书籍阅读教练 / 批判性读者"视角作答：

* 区分作者原意、文本证据、你的解释和可迁移启发。
* 主动寻找核心论证链，而不是只摘录漂亮句子。
* 记录反例、遗漏的问题、时代背景和作者可能的偏见。
* 把值得长期保留的概念沉淀为可复用的原子笔记。`,
      'structures/book-notes.md': `## 书籍信息

* 作者、出版时间、版本、阅读进度
* 本书所属主题、传统或问题域

## 核心问题

* 作者试图回答什么问题
* 本章/本书的中心主张是什么

## 论证结构

* 关键概念
* 主要证据、案例或推理链
* 论证中最薄弱的一环

## 摘录与解释

* 重要摘录
* 为什么重要
* 与已有笔记的关系

## 可迁移启发

* 对生活、研究、产品或决策有什么启发
* 哪些观点值得变成独立原子笔记

## 延伸问题

* 下一步要追问或查证的问题`,
      'commands/reading-session.md': `# Reading Session

Suggested command:

\`\`\`powershell
wiki ingest sources/books/<book-or-chapter>.md -p book-critic -s book-notes
wiki ask "这本书最值得沉淀成长期知识的观点是什么？" -p book-critic -s concept-deep-dive
\`\`\`
`,
      'skills/reading-skill.md': `# Reading Skill

Use this vault for book-level and chapter-level ingestion. Prefer source-grounded literature notes first, then promote durable concepts with \`ask\`.
`,
    },
    wikiAppendix: `## Scenario Profile: Book Reading

This vault is optimized for book reading.

- Keep raw book notes, chapter exports, and quotes under \`sources/books/\`.
- Use \`book-critic\` as the default reading persona.
- Use \`book-notes\` for chapter or full-book ingestion.
- Promote durable ideas into atomic notes after ingestion; do not let chapter summaries become the only knowledge layer.
- Treat quotes as evidence, not conclusions. The synthesis must explain why the quote matters.`,
  },

  research: {
    name: 'research',
    label: 'Literature Research',
    description: 'Academic paper review, research maps, evidence comparison, and follow-up questions.',
    aliases: ['paper', 'papers', 'literature', 'academic'],
    dirs: ['sources/papers', 'sources/datasets', 'templates/commands', 'templates/skills', 'meta/research'],
    domains: {
      research: ['papers', 'methods', 'datasets', 'findings', 'open-questions'],
    },
    templates: {
      'personas/literature-reviewer.md': `以"文献综述研究员"视角作答：

* 把单篇文献放回研究脉络中，说明它回应了哪个问题。
* 区分贡献、方法、证据强度、局限和可复现性。
* 主动比较相关工作，不把作者的自我定位当作事实。
* 输出后续研究问题和可检验假设。`,
      'structures/literature-review.md': `## 研究问题

* 论文要解决的问题
* 该问题为什么重要

## 相关工作位置

* 继承了哪些路线
* 与最接近工作的区别

## 方法与数据

* 方法设计
* 数据集、样本、实验设置
* 关键假设

## 证据与结果

* 主要发现
* 消融、稳健性或统计检验
* 证据强度评估

## 局限与威胁

* 内部效度、外部效度、构念效度
* 可复现性风险

## 研究地图影响

* 支持、修正或挑战了哪些已有笔记
* 下一步值得追的问题`,
      'commands/research-ingest.md': `# Research Ingest

Suggested command:

\`\`\`powershell
wiki deep-ingest sources/papers/<paper>.pdf -p literature-reviewer -s literature-review --questions 5
\`\`\`
`,
      'skills/research-skill.md': `# Research Skill

Use this vault for source-grounded literature ingestion. Prioritize methodology, evidence strength, and how each paper changes the research map.
`,
    },
    wikiAppendix: `## Scenario Profile: Literature Research

This vault is optimized for research workflows.

- Put papers under \`sources/papers/\` and datasets or appendices under \`sources/datasets/\`.
- Prefer \`deep-ingest\` for important papers so the vault creates follow-up synthesis notes.
- Use \`literature-reviewer\` + \`literature-review\` when source quality and methodology matter.
- Every synthesis should separate claim, evidence, limitation, and implication.`,
  },

  market: {
    name: 'market',
    label: 'Product Market Analysis',
    description: 'Market maps, competitors, users, positioning, and go-to-market analysis.',
    aliases: ['product-market', 'product', 'pm', 'marketing'],
    dirs: ['sources/market', 'sources/competitors', 'templates/commands', 'templates/skills', 'meta/market'],
    domains: {
      market: ['customers', 'competitors', 'positioning', 'gtm', 'pricing'],
      product: ['discovery', 'metrics', 'roadmap'],
    },
    templates: {
      'personas/product-strategist.md': `以"产品战略负责人"视角作答：

* 关注用户任务、市场结构、竞争位置和可执行决策。
* 明确区分事实、假设、洞察和需要验证的问题。
* 对每个建议说明它影响获客、激活、留存、收入还是推荐。
* 主动暴露定位不清、目标用户过宽、证据不足等风险。`,
      'structures/product-market-brief.md': `## 市场定义

* 目标用户与使用场景
* JTBD 与现有替代方案

## 竞争格局

* 直接竞品、间接竞品、非消费替代
* 差异化维度

## 用户与需求

* 核心痛点
* 购买/采用触发
* 关键阻力

## 商业与增长

* 定价、渠道、获客、留存
* AARRR 指标影响

## 定位判断

* 可占据的位置
* 证据、假设和待验证事项

## 下一步实验

* 最小验证动作
* 成功/失败判据`,
      'commands/market-brief.md': `# Market Brief

Suggested command:

\`\`\`powershell
wiki ask "为 <产品/赛道> 做一份产品市场分析" -p product-strategist -s product-market-brief
wiki ingest sources/competitors/<competitor>.md -p product-strategist -s company-competitor-deepdive
\`\`\`
`,
      'skills/market-skill.md': `# Market Skill

Use this vault for market, customer, competitor, and positioning analysis. Keep assumptions explicit and turn them into validation questions.
`,
    },
    wikiAppendix: `## Scenario Profile: Product Market Analysis

This vault is optimized for product and market work.

- Put market reports under \`sources/market/\` and competitor snapshots under \`sources/competitors/\`.
- Use \`product-strategist\` + \`product-market-brief\` for market briefs.
- Keep facts, assumptions, and validation questions separate.
- Favor decisions and experiments over descriptive summaries.`,
  },

  investment: {
    name: 'investment',
    label: 'Investment Research',
    description: 'Company research, theses, catalysts, risks, valuation assumptions, and watchlists.',
    aliases: ['invest', 'investing', 'equity', 'stock', 'finance'],
    dirs: ['sources/filings', 'sources/research', 'templates/commands', 'templates/skills', 'meta/investment'],
    domains: {
      investment: ['companies', 'industries', 'theses', 'risks', 'valuation', 'catalysts'],
    },
    templates: {
      'personas/investment-analyst.md': `以"买方投研分析师"视角作答：

* 所有结论都落到投资含义、风险收益、时间维度和关键假设。
* 区分事实、管理层表述、市场共识、你的推论。
* 主动寻找反证、估值敏感变量、催化剂和下行风险。
* 不给投资建议式口号，给需要继续验证的数据和观察指标。`,
      'structures/investment-memo.md': `## 一句话结论

* 当前判断
* 时间维度
* 最大不确定性

## 公司/资产概况

* 业务构成
* 收入与利润驱动
* 竞争位置

## 投资逻辑

* 核心假设
* 增长、利润率、现金流或估值重估路径
* 催化剂

## 关键风险

* 业务风险
* 财务风险
* 估值风险
* 反身性或拥挤交易风险

## 估值框架

* 可比、DCF 或情景分析
* 敏感变量
* 上行/基准/下行情景

## 跟踪清单

* 需要持续观察的数据
* 会推翻结论的信号`,
      'commands/investment-memo.md': `# Investment Memo

Suggested command:

\`\`\`powershell
wiki ask "为 <公司/资产> 写一份投研 memo" -p investment-analyst -s investment-memo
wiki ingest sources/filings/<filing>.pdf -p investment-analyst -s company-competitor-deepdive
\`\`\`
`,
      'skills/investment-skill.md': `# Investment Skill

Use this vault for research notes, theses, and tracking logs. Keep assumptions, risks, catalysts, and disconfirming evidence visible.
`,
    },
    wikiAppendix: `## Scenario Profile: Investment Research

This vault is optimized for investment research.

- Put filings under \`sources/filings/\` and third-party research under \`sources/research/\`.
- Use \`investment-analyst\` + \`investment-memo\` for thesis notes.
- Every conclusion should name its time horizon, key assumption, and disconfirming evidence.
- Track catalysts and risks as first-class knowledge, not appendix material.`,
  },

  project: {
    name: 'project',
    label: 'Project Management',
    description: 'Project decisions, plans, risks, postmortems, and stakeholder context.',
    aliases: ['project-management', 'pm-work', 'delivery'],
    dirs: ['sources/meetings', 'sources/specs', 'templates/commands', 'templates/skills', 'meta/project'],
    domains: {
      project: ['goals', 'decisions', 'risks', 'plans', 'postmortems', 'stakeholders'],
    },
    templates: {
      'personas/project-operator.md': `以"项目负责人 / 运营负责人"视角作答：

* 把讨论收敛成目标、约束、决策、负责人、风险和下一步。
* 区分已决定、待决定、阻塞项和开放问题。
* 主动识别依赖关系、沟通风险、范围蔓延和验收标准缺失。
* 输出可执行动作，而不是会议纪要式复述。`,
      'structures/project-brief.md': `## 背景与目标

* 项目为什么存在
* 成功标准
* 非目标

## 范围与约束

* 范围内
* 范围外
* 时间、资源、技术、组织约束

## 当前状态

* 已完成
* 进行中
* 阻塞项

## 决策记录

* 已决定事项
* 决策依据
* 影响范围

## 风险与依赖

* 风险
* 外部依赖
* 缓解动作

## 下一步

* 行动项
* 负责人
* 截止时间`,
      'commands/project-update.md': `# Project Update

Suggested command:

\`\`\`powershell
wiki ingest sources/meetings/<meeting-notes>.md -p project-operator -s project-brief
wiki ask "当前项目最大的风险和下一步动作是什么？" -p project-operator -s project-brief
\`\`\`
`,
      'skills/project-skill.md': `# Project Skill

Use this vault for durable project memory: decisions, risks, dependencies, and postmortems. Keep actions and ownership explicit.
`,
    },
    wikiAppendix: `## Scenario Profile: Project Management

This vault is optimized for project work.

- Put meeting notes under \`sources/meetings/\` and specs under \`sources/specs/\`.
- Use \`project-operator\` + \`project-brief\` for project state and meeting ingestion.
- Preserve decision rationale and open risks. Future readers should understand why a choice was made.
- Treat action items as outputs of synthesis, not as ungrounded task spam.`,
  },
};

export function profileNames() {
  return Object.keys(VAULT_PROFILES);
}

export function resolveProfile(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  for (const profile of Object.values(VAULT_PROFILES)) {
    if (profile.name === key || profile.aliases?.includes(key)) return profile;
  }
  throw new Error(`Unknown profile: ${name}. Available profiles: ${profileNames().join(', ')}`);
}
