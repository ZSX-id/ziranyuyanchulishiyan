/**
 * js/tools.js - Agent 工具定义与执行层
 * 
 * 实现以下工具（供 Function Calling 使用）：
 * 1. get_stock_quote      - 获取股票实时行情与 K 线数据
 * 2. search_financial_news - 搜索金融新闻与舆情
 * 3. analyze_sentiment    - 对文本列表进行批量情感分析（异步并发）
 * 4. generate_report      - 生成结构化 Markdown 报告
 * 5. get_macro_indicator  - 获取宏观经济指标
 * 6. get_fund_flow        - 获取资金流向数据
 */

// ====================================================
// 工具描述（OpenAI Function Calling 格式，百炼兼容）
// ====================================================
const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'get_stock_quote',
            description: '获取A股、港股或美股的实时行情数据、K线历史数据、涨跌幅等信息。输入股票代码或名称，返回最新价格、涨跌幅、成交量、市值等关键指标。',
            parameters: {
                type: 'object',
                properties: {
                    symbol: {
                        type: 'string',
                        description: '股票代码，格式：A股如 sh600519（沪市）/ sz000001（深市），港股如 hk00700，美股如 usAAPL。也可直接输入股票名称如"贵州茅台"'
                    },
                    data_type: {
                        type: 'string',
                        enum: ['quote', 'kline', 'profile'],
                        description: 'quote=实时行情, kline=K线数据, profile=公司概况'
                    },
                    period: {
                        type: 'string',
                        enum: ['day', 'week', 'month'],
                        description: 'K线周期，仅 kline 时有效，默认 day'
                    },
                    count: {
                        type: 'number',
                        description: '返回K线数量，默认 20'
                    }
                },
                required: ['symbol', 'data_type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_financial_news',
            description: '搜索最新的金融市场新闻、上市公司公告、监管政策、行业动态等舆情信息。返回新闻标题、摘要、发布时间、来源等内容。',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: '搜索关键词，例如"贵州茅台 业绩"、"A股科技板块 政策"、"美联储 加息"等'
                    },
                    category: {
                        type: 'string',
                        enum: ['stock', 'macro', 'policy', 'industry', 'global', 'all'],
                        description: '新闻类别：stock=个股, macro=宏观, policy=政策, industry=行业, global=全球, all=全部'
                    },
                    time_range: {
                        type: 'string',
                        enum: ['1d', '3d', '7d', '30d'],
                        description: '时间范围：最近1天/3天/7天/30天，默认7天'
                    },
                    limit: {
                        type: 'number',
                        description: '返回新闻条数，默认5条，最多10条'
                    }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'analyze_sentiment',
            description: '对多段文本（如新闻标题或内容）进行批量情感分析，并发处理，返回每条文本的情感极性（正面/负面/中性）和置信度。适用于快速评估市场情绪。',
            parameters: {
                type: 'object',
                properties: {
                    texts: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '待分析的文本列表，每条文本长度不超过500字'
                    },
                    context: {
                        type: 'string',
                        description: '分析背景，如"A股市场"、"港股市场"等，帮助模型理解语义'
                    }
                },
                required: ['texts']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_report',
            description: '将收集到的股票行情、新闻舆情、情感分析结果整合，生成一份结构完整的Markdown格式金融分析报告，包含执行摘要、数据分析、舆情评估、风险提示和投资建议。',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: '报告标题，如"贵州茅台(600519)综合分析报告"'
                    },
                    subject: {
                        type: 'string',
                        description: '分析主体，如股票名称、板块名称或市场名称'
                    },
                    market_data: {
                        type: 'object',
                        description: '市场行情数据，包含价格、涨跌等信息'
                    },
                    news_data: {
                        type: 'array',
                        description: '新闻列表数据'
                    },
                    sentiment_data: {
                        type: 'object',
                        description: '情感分析汇总结果'
                    },
                    analysis_focus: {
                        type: 'string',
                        description: '分析重点，如"短期交易机会"、"长期投资价值"、"风险评估"等'
                    }
                },
                required: ['title', 'subject']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_macro_indicator',
            description: '获取宏观经济指标数据，包括GDP增速、CPI/PPI通胀率、利率、PMI制造业指数、社融数据等，用于分析宏观经济环境对市场的影响。',
            parameters: {
                type: 'object',
                properties: {
                    indicator: {
                        type: 'string',
                        enum: ['cpi', 'ppi', 'gdp', 'pmi', 'rate', 'm2', 'trade'],
                        description: 'cpi=消费者物价指数, ppi=工业品价格指数, gdp=GDP增速, pmi=制造业PMI, rate=利率, m2=货币供应, trade=贸易数据'
                    },
                    region: {
                        type: 'string',
                        enum: ['china', 'us', 'eu', 'global'],
                        description: '地区：china=中国, us=美国, eu=欧元区, global=全球'
                    }
                },
                required: ['indicator']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_fund_flow',
            description: '获取股票或板块的资金流向数据，包括主力净流入/净流出、大单/小单比例、北向资金动向等，判断机构和游资的行为趋势。',
            parameters: {
                type: 'object',
                properties: {
                    symbol: {
                        type: 'string',
                        description: '股票代码，如 sh600519，或板块名称如"科技"、"医疗"'
                    },
                    period: {
                        type: 'string',
                        enum: ['today', '3d', '5d', '10d'],
                        description: '统计周期'
                    }
                },
                required: ['symbol']
            }
        }
    }
];

// ====================================================
// 工具执行层 - 每个工具的实际运行逻辑
// 注：浏览器端无法直接跨域调用 westock-data CLI，
//     此处通过模拟 + DashScope 搜索 API 双重实现。
//     真实部署时可通过后端代理转发 westock 命令。
// ====================================================

const ToolExecutor = {

    /**
     * 主入口：根据工具名称分发调用
     * @param {string} name 工具名
     * @param {object} args 参数
     * @param {string} apiKey 百炼 API Key
     * @returns {Promise<object>} 工具结果
     */
    async execute(name, args, apiKey) {
        const startTime = Date.now();
        let result;
        try {
            switch (name) {
                case 'get_stock_quote':
                    result = await this.getStockQuote(args, apiKey);
                    break;
                case 'search_financial_news':
                    result = await this.searchFinancialNews(args, apiKey);
                    break;
                case 'analyze_sentiment':
                    result = await this.analyzeSentiment(args, apiKey);
                    break;
                case 'generate_report':
                    result = await this.generateReport(args, apiKey);
                    break;
                case 'get_macro_indicator':
                    result = await this.getMacroIndicator(args, apiKey);
                    break;
                case 'get_fund_flow':
                    result = await this.getFundFlow(args, apiKey);
                    break;
                default:
                    result = { error: `未知工具: ${name}` };
            }
        } catch (e) {
            result = { error: e.message, tool: name };
        }
        return { ...result, _elapsed_ms: Date.now() - startTime };
    },

    // --------------------------------------------------
    // 工具 1: 获取股票行情
    // --------------------------------------------------
    async getStockQuote(args, apiKey) {
        const { symbol, data_type, period = 'day', count = 20 } = args;

        // 使用百炼 qwen-turbo + 搜索能力获取行情信息
        const prompt = data_type === 'profile'
            ? `请提供 "${symbol}" 的公司基本信息，包括：主营业务、行业分类、注册地、成立时间、员工人数、主要产品/服务。以JSON格式输出。`
            : data_type === 'kline'
            ? `请提供 "${symbol}" 最近${count}个交易日的收盘价走势数据，包括日期、开盘价、收盘价、最高价、最低价、成交量。以JSON格式输出，字段名用英文：date, open, close, high, low, volume。`
            : `请提供 "${symbol}" 的最新股票行情数据，包括：最新价格、涨跌额、涨跌幅、今日开盘价、昨日收盘价、最高价、最低价、成交量、成交额、市值、市盈率、市净率。以JSON格式输出。`;

        const response = await callDashScope(apiKey, [
            { role: 'system', content: '你是一个专业的金融数据助手，擅长提供准确的股票市场数据。当前日期：' + new Date().toLocaleDateString('zh-CN') },
            { role: 'user', content: prompt }
        ], 'qwen-plus', false, { enable_search: true });

        return {
            tool: 'get_stock_quote',
            symbol,
            data_type,
            data: response.content,
            source: '阿里云百炼 + 实时搜索',
            timestamp: new Date().toISOString()
        };
    },

    // --------------------------------------------------
    // 工具 2: 搜索金融新闻
    // --------------------------------------------------
    async searchFinancialNews(args, apiKey) {
        const { query, category = 'all', time_range = '7d', limit = 5 } = args;

        const timeDesc = { '1d': '今天', '3d': '最近3天', '7d': '最近一周', '30d': '最近一个月' }[time_range] || '最近一周';
        const catDesc = { stock: '个股新闻', macro: '宏观经济', policy: '政策监管', industry: '行业动态', global: '全球市场', all: '综合金融' }[category] || '金融';

        const prompt = `请搜索并整理 "${query}" 相关的${catDesc}重要资讯（${timeDesc}内），返回${limit}条最重要的新闻。每条新闻包含：
1. title: 新闻标题
2. summary: 内容摘要（100字以内）
3. sentiment: 市场情绪影响（positive/negative/neutral）
4. importance: 重要程度（high/medium/low）
5. source: 来源媒体
6. time: 发布时间（估计）

以JSON数组格式输出，字段名用英文，数组变量名为 news_list。`;

        const response = await callDashScope(apiKey, [
            { role: 'system', content: '你是一个专业的金融新闻分析师，善于从海量资讯中筛选出对市场影响最大的关键信息。当前日期：' + new Date().toLocaleDateString('zh-CN') },
            { role: 'user', content: prompt }
        ], 'qwen-plus', false, { enable_search: true });

        return {
            tool: 'search_financial_news',
            query,
            category,
            time_range,
            data: response.content,
            source: '阿里云百炼实时搜索',
            timestamp: new Date().toISOString()
        };
    },

    // --------------------------------------------------
    // 工具 3: 批量情感分析（异步并发）
    // --------------------------------------------------
    async analyzeSentiment(args, apiKey) {
        const { texts, context = '中国金融市场' } = args;
        if (!texts || texts.length === 0) {
            return { error: '文本列表不能为空' };
        }

        const startTime = Date.now();

        // 异步并发：每条文本独立发起分析请求（或分批处理）
        // 为避免触发限流，最多同时并发 3 条
        const CONCURRENT_LIMIT = 3;
        const results = [];

        for (let i = 0; i < texts.length; i += CONCURRENT_LIMIT) {
            const batch = texts.slice(i, i + CONCURRENT_LIMIT);
            const batchPromises = batch.map(async (text, idx) => {
                const response = await callDashScope(apiKey, [
                    {
                        role: 'system',
                        content: `你是一个专业的金融文本情感分析器，专注于${context}领域。请分析文本对市场/股价的情感影响。`
                    },
                    {
                        role: 'user',
                        content: `分析以下文本的市场情绪，返回JSON格式：{"sentiment": "positive/negative/neutral", "confidence": 0.0-1.0, "reason": "简短理由", "impact": "对股市的影响描述"}\n\n文本：${text}`
                    }
                ], 'qwen-turbo', false);

                return {
                    text: text.length > 60 ? text.slice(0, 60) + '…' : text,
                    result: response.content,
                    index: i + idx
                };
            });

            const batchResults = await Promise.allSettled(batchPromises);
            batchResults.forEach(r => {
                if (r.status === 'fulfilled') {
                    results.push(r.value);
                } else {
                    results.push({ error: r.reason?.message || '分析失败' });
                }
            });

            // 批次间加入短暂延迟，避免触发 API 限流
            if (i + CONCURRENT_LIMIT < texts.length) {
                await sleep(300);
            }
        }

        const elapsed = Date.now() - startTime;
        const successCount = results.filter(r => !r.error).length;

        return {
            tool: 'analyze_sentiment',
            total: texts.length,
            success: successCount,
            concurrent_batches: Math.ceil(texts.length / CONCURRENT_LIMIT),
            elapsed_ms: elapsed,
            results,
            summary: `并发分析 ${texts.length} 条文本，成功 ${successCount} 条，耗时 ${elapsed}ms`
        };
    },

    // --------------------------------------------------
    // 工具 4: 生成结构化报告
    // --------------------------------------------------
    async generateReport(args, apiKey) {
        const { title, subject, market_data, news_data, sentiment_data, analysis_focus = '综合分析' } = args;

        const dataContext = [
            market_data ? `## 行情数据\n${JSON.stringify(market_data, null, 2)}` : '',
            news_data ? `## 新闻舆情\n${JSON.stringify(news_data, null, 2)}` : '',
            sentiment_data ? `## 情感分析\n${JSON.stringify(sentiment_data, null, 2)}` : ''
        ].filter(Boolean).join('\n\n');

        const prompt = `请基于以下收集到的数据，生成一份专业的金融分析报告。

报告主题：${title}
分析重点：${analysis_focus}

数据资料：
${dataContext || '（请根据 ' + subject + ' 的一般性知识进行分析）'}

报告要求（Markdown格式）：
1. **执行摘要**（3-5句话，核心结论）
2. **市场行情分析**（价格走势、技术面解读）
3. **舆情评估**（新闻热度、市场情绪、舆情风险）
4. **宏观环境影响**（政策、利率、行业趋势）
5. **风险提示**（潜在风险因素，至少3点）
6. **综合结论**（客观中立，不构成投资建议）

注意：报告需客观专业，在结尾注明"本报告仅供参考，不构成投资建议"。`;

        const response = await callDashScope(apiKey, [
            {
                role: 'system',
                content: '你是一位资深金融分析师，曾任职于头部券商研究所，擅长撰写深度投研报告。报告风格专业、严谨、客观中立。当前日期：' + new Date().toLocaleDateString('zh-CN')
            },
            { role: 'user', content: prompt }
        ], 'qwen-plus', false);

        return {
            tool: 'generate_report',
            title,
            subject,
            report_markdown: response.content,
            generated_at: new Date().toISOString(),
            word_count: response.content.length
        };
    },

    // --------------------------------------------------
    // 工具 5: 宏观经济指标
    // --------------------------------------------------
    async getMacroIndicator(args, apiKey) {
        const { indicator, region = 'china' } = args;
        const indicatorNames = {
            cpi: 'CPI（消费者物价指数）',
            ppi: 'PPI（工业品出厂价格）',
            gdp: 'GDP增速',
            pmi: 'PMI（制造业采购经理人指数）',
            rate: '基准利率/国债收益率',
            m2: 'M2货币供应量增速',
            trade: '进出口贸易数据'
        };
        const regionNames = { china: '中国', us: '美国', eu: '欧元区', global: '全球' };

        const prompt = `请提供 ${regionNames[region] || region} 最新的 ${indicatorNames[indicator] || indicator} 数据，包括：
1. 最新数值及发布时间
2. 与上期相比的变化
3. 市场预期值（如有）
4. 与近12个月历史数据的对比
5. 该指标当前对 ${region === 'china' ? 'A股' : '资本'} 市场的影响解读

以JSON格式输出，包含 current_value, previous_value, change, expectation, historical_trend, market_impact 字段。`;

        const response = await callDashScope(apiKey, [
            { role: 'system', content: '你是一名宏观经济研究员，专注于分析经济数据对资本市场的影响。当前日期：' + new Date().toLocaleDateString('zh-CN') },
            { role: 'user', content: prompt }
        ], 'qwen-plus', false, { enable_search: true });

        return {
            tool: 'get_macro_indicator',
            indicator,
            region,
            data: response.content,
            source: '阿里云百炼 + 实时搜索',
            timestamp: new Date().toISOString()
        };
    },

    // --------------------------------------------------
    // 工具 6: 资金流向
    // --------------------------------------------------
    async getFundFlow(args, apiKey) {
        const { symbol, period = 'today' } = args;
        const periodNames = { today: '今日', '3d': '近3天', '5d': '近5天', '10d': '近10天' };

        const prompt = `请提供 "${symbol}" ${periodNames[period] || period} 的资金流向数据，包括：
1. 主力净流入/净流出金额
2. 超大单/大单/中单/小单的净流量
3. 北向资金（沪深股通）动向（如适用）
4. 资金流向趋势解读
5. 与同板块/同行业的资金流向对比

以JSON格式输出：{main_flow, large_order, medium_order, small_order, northbound, trend_analysis, comparison}`;

        const response = await callDashScope(apiKey, [
            { role: 'system', content: '你是专业的A股资金流向分析师，熟悉主力行为分析。当前日期：' + new Date().toLocaleDateString('zh-CN') },
            { role: 'user', content: prompt }
        ], 'qwen-plus', false, { enable_search: true });

        return {
            tool: 'get_fund_flow',
            symbol,
            period,
            data: response.content,
            timestamp: new Date().toISOString()
        };
    }
};

// ====================================================
// 辅助函数
// ====================================================

/**
 * 调用 DashScope 阿里云百炼 API（非流式）
 * @param {string} apiKey
 * @param {Array} messages
 * @param {string} model
 * @param {boolean} stream
 * @param {object} extra 额外参数（如 enable_search）
 */
async function callDashScope(apiKey, messages, model = 'qwen-plus', stream = false, extra = {}) {
    const body = {
        model,
        messages,
        stream,
        ...extra
    };

    const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`DashScope API 错误 ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    return { content, usage, model };
}

/**
 * Sleep 辅助函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 挂载到全局（供 agent.js 使用）
window.TOOL_DEFINITIONS = TOOL_DEFINITIONS;
window.ToolExecutor = ToolExecutor;
window.callDashScope = callDashScope;
