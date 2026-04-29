/**
 * js/agent.js - Agent 核心调度引擎
 *
 * 实现 Agentic Loop：
 * 1. 接收用户输入
 * 2. 带工具定义调用 LLM
 * 3. 若 LLM 返回 tool_calls → 执行工具 → 将结果回填 → 继续循环
 * 4. 若 LLM 返回最终文本 → 流式输出给用户
 * 5. 全程通过 CoT 事件总线向 UI 推送思考步骤
 */

// ====================================================
// System Prompts（根据模式切换）
// ====================================================
const SYSTEM_PROMPTS = {
    financial: `你是一位资深金融舆情分析智能体，名叫"灵犀"，由阿里云百炼大模型驱动。

【核心能力】
你拥有以下专业工具，可根据需要自主调用：
- get_stock_quote: 获取实时股票行情、K线数据
- search_financial_news: 搜索最新金融新闻和舆情
- analyze_sentiment: 对新闻文本进行批量情感分析（支持并发）
- generate_report: 生成结构化Markdown分析报告
- get_macro_indicator: 查询宏观经济指标
- get_fund_flow: 获取资金流向数据

【工作原则】
1. 收到用户问题后，先规划分析步骤，再逐步调用工具收集数据
2. 优先使用多个工具交叉验证，提高分析准确性
3. 对于新闻舆情分析，务必调用 analyze_sentiment 进行情感量化
4. 最终结论必须基于工具返回的真实数据，不能凭空捏造数据
5. 分析结果客观中立，风险提示清晰，不构成具体投资建议

【输出规范】
- 过程中可以简短说明正在执行的步骤
- 最终报告使用 Markdown 格式，结构清晰
- 数据展示使用表格，便于阅读
- 今天日期：${new Date().toLocaleDateString('zh-CN')}`,

    research: `你是一位资深学术研究助手，名叫"灵犀"，专注于文献调研与综述撰写。

你拥有以下工具：
- search_financial_news: 搜索学术资讯和研究动态（可用于泛化搜索）
- analyze_sentiment: 批量分析文本观点倾向
- generate_report: 生成结构化综述报告

工作方式：先搜索相关文献和资讯 → 提取关键信息 → 分析研究趋势 → 生成综述报告。
今天日期：${new Date().toLocaleDateString('zh-CN')}`,

    general: `你是一个智能对话助手，名叫"灵犀"，由阿里云百炼大模型驱动。
你拥有多种工具可以调用，以更好地回答用户问题。
今天日期：${new Date().toLocaleDateString('zh-CN')}`
};

// ====================================================
// CoT 事件总线
// ====================================================
const CotBus = {
    _listeners: {},
    on(event, cb) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
    },
    emit(event, data) {
        (this._listeners[event] || []).forEach(cb => cb(data));
    }
};

// ====================================================
// Agent 核心类
// ====================================================
class FinancialAgent {
    constructor(apiKey, mode = 'financial', maxIterations = 5) {
        this.apiKey = apiKey;
        this.mode = mode;
        this.maxIterations = maxIterations;
        this.abortController = null;
        this.isRunning = false;
        this.totalToolCalls = 0;
        this.totalTokens = 0;
        this.startTime = null;
    }

    /**
     * 主入口：处理一轮用户输入
     * @param {Array} messages 完整对话历史（含本次用户消息）
     * @param {function} onStreamDelta 流式文本回调 (delta: string)
     * @param {function} onFinalMessage 最终消息回调
     */
    async run(messages, onStreamDelta, onFinalMessage) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.abortController = new AbortController();
        this.totalToolCalls = 0;
        this.totalTokens = 0;
        this.startTime = Date.now();

        // 重置 CoT 面板
        CotBus.emit('reset', {});
        CotBus.emit('start', { message: '智能体开始分析任务…' });

        // 构建带 system prompt 的完整消息列表
        const systemPrompt = SYSTEM_PROMPTS[this.mode] || SYSTEM_PROMPTS.financial;
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        let iteration = 0;
        let accumulatedMessages = [...fullMessages];

        try {
            while (iteration < this.maxIterations) {
                if (this.abortController.signal.aborted) break;
                iteration++;

                CotBus.emit('thinking', {
                    iteration,
                    message: iteration === 1 ? '理解用户意图，规划分析步骤…' : '整合工具结果，继续推理…'
                });

                // 调用 LLM（非流式，以支持 Function Calling）
                const llmResult = await this._callLLM(accumulatedMessages, iteration === this.maxIterations);
                this.totalTokens += llmResult.usage?.total_tokens || 0;

                const choice = llmResult.choices?.[0];
                if (!choice) throw new Error('LLM 返回空响应');

                const finishReason = choice.finish_reason;
                const message = choice.message;

                // Case 1: LLM 决定调用工具
                if (finishReason === 'tool_calls' && message.tool_calls?.length > 0) {
                    accumulatedMessages.push({
                        role: 'assistant',
                        content: message.content || null,
                        tool_calls: message.tool_calls
                    });

                    // 执行所有工具（支持并发）
                    const toolResults = await this._executeToolsConcurrently(message.tool_calls);

                    // 将工具结果追加到消息历史
                    toolResults.forEach(tr => {
                        accumulatedMessages.push({
                            role: 'tool',
                            tool_call_id: tr.tool_call_id,
                            content: JSON.stringify(tr.result)
                        });
                    });

                    continue; // 继续下一轮循环
                }

                // Case 2: LLM 给出最终回答（流式输出）
                if (finishReason === 'stop' || !message.tool_calls) {
                    CotBus.emit('generating', { message: '正在生成最终分析报告…' });

                    const finalContent = message.content || '';

                    // 若已有内容直接输出（非流式轮次的结果）
                    if (finalContent) {
                        // 模拟流式输出效果（字符逐步推送）
                        await this._simulateStream(finalContent, onStreamDelta);
                        onFinalMessage(finalContent);
                    } else {
                        // 发起真正的流式请求获取最终回答
                        await this._streamFinalAnswer(accumulatedMessages, onStreamDelta, onFinalMessage);
                    }

                    CotBus.emit('done', {
                        totalToolCalls: this.totalToolCalls,
                        totalTime: Date.now() - this.startTime,
                        totalTokens: this.totalTokens
                    });
                    break;
                }

                // 防止死循环
                if (iteration >= this.maxIterations) {
                    CotBus.emit('warning', { message: `已达到最大迭代次数(${this.maxIterations})，强制生成结论` });
                    await this._streamFinalAnswer(accumulatedMessages, onStreamDelta, onFinalMessage);
                    break;
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                CotBus.emit('error', { message: err.message });
                throw err;
            }
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * 调用 LLM（非流式，支持 Function Calling）
     */
    async _callLLM(messages, forceAnswer = false) {
        const body = {
            model: 'qwen-plus',
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: forceAnswer ? 'none' : 'auto',
            stream: false
        };

        const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: this.abortController.signal
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`LLM 调用失败 ${resp.status}: ${errText}`);
        }

        return await resp.json();
    }

    /**
     * 并发执行多个工具调用
     */
    async _executeToolsConcurrently(toolCalls) {
        CotBus.emit('tools_start', {
            tools: toolCalls.map(tc => tc.function.name),
            count: toolCalls.length,
            message: toolCalls.length > 1
                ? `并发调用 ${toolCalls.length} 个工具: ${toolCalls.map(tc => tc.function.name).join(', ')}`
                : `调用工具: ${toolCalls[0].function.name}`
        });

        const promises = toolCalls.map(async (tc) => {
            const toolName = tc.function.name;
            const toolArgs = JSON.parse(tc.function.arguments || '{}');
            const toolStartTime = Date.now();

            CotBus.emit('tool_start', {
                id: tc.id,
                name: toolName,
                args: toolArgs,
                message: `▶ 开始调用 ${toolName}`,
            });

            const result = await ToolExecutor.execute(toolName, toolArgs, this.apiKey);
            const elapsed = Date.now() - toolStartTime;
            this.totalToolCalls++;

            CotBus.emit('tool_done', {
                id: tc.id,
                name: toolName,
                elapsed,
                result,
                message: `✓ ${toolName} 完成，耗时 ${elapsed}ms`
            });

            return { tool_call_id: tc.id, name: toolName, result };
        });

        const results = await Promise.allSettled(promises);
        return results.map((r, i) => {
            if (r.status === 'fulfilled') return r.value;
            CotBus.emit('tool_error', {
                name: toolCalls[i].function.name,
                error: r.reason?.message
            });
            return {
                tool_call_id: toolCalls[i].id,
                name: toolCalls[i].function.name,
                result: { error: r.reason?.message || '工具执行失败' }
            };
        });
    }

    /**
     * 流式输出最终回答
     */
    async _streamFinalAnswer(messages, onStreamDelta, onFinalMessage) {
        const body = {
            model: 'qwen-plus',
            messages,
            stream: true
        };

        const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: this.abortController.signal
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`流式请求失败: ${errText}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullContent = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const dataStr = line.slice(5).trim();
                if (dataStr === '[DONE]') continue;
                try {
                    const data = JSON.parse(dataStr);
                    const delta = data.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullContent += delta;
                        onStreamDelta(delta);
                    }
                    const usage = data.usage;
                    if (usage) this.totalTokens += usage.total_tokens || 0;
                } catch (_) {}
            }
        }

        onFinalMessage(fullContent);
    }

    /**
     * 模拟流式输出（将非流式文本按字符推送）
     */
    async _simulateStream(text, onStreamDelta) {
        const CHUNK_SIZE = 3;
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
            if (this.abortController.signal.aborted) break;
            onStreamDelta(text.slice(i, i + CHUNK_SIZE));
            await sleep(8);
        }
    }

    /**
     * 中断当前运行
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.isRunning = false;
        CotBus.emit('aborted', { message: '用户已中断智能体运行' });
    }
}

// 挂载到全局
window.FinancialAgent = FinancialAgent;
window.CotBus = CotBus;
window.SYSTEM_PROMPTS = SYSTEM_PROMPTS;
