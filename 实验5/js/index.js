/**
 * js/index.js - 灵犀 AI 对话助手 · UI 控制层
 *
 * 负责：
 * - UI 交互（输入/输出/主题/弹窗）
 * - CoT 面板渲染（思考链路可视化）
 * - Agent 调度（创建 FinancialAgent 实例并运行）
 * - 消息列表管理
 */

(function () {
    // ============================================================
    // 状态
    // ============================================================
    let messages = [];
    let isLoading = false;
    let agent = null;
    let apiKey = localStorage.getItem('LINGXI_API_KEY') || '';
    let agentMode = localStorage.getItem('LINGXI_AGENT_MODE') || 'financial';
    let maxIter = parseInt(localStorage.getItem('LINGXI_MAX_ITER') || '5', 10);
    let selectedImageBase64 = '';
    let selectedImageType = '';
    let cotStepCount = 0;
    let cotPanelOpen = false;

    // ============================================================
    // DOM 元素
    // ============================================================
    const homeSection = document.getElementById('homeSection');
    const messageSection = document.getElementById('messageSection');
    const messageList = document.getElementById('messageList');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearBtn = document.getElementById('clearBtn');
    const themeToggle = document.getElementById('themeToggle');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const previewContainer = document.getElementById('previewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const cards = document.querySelectorAll('.card');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const modalClose = document.getElementById('modalClose');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const agentModeSelect = document.getElementById('agentModeSelect');
    const maxIterInput = document.getElementById('maxIterInput');
    const saveSettings = document.getElementById('saveSettings');
    const cotPanel = document.getElementById('cotPanel');
    const cotToggle = document.getElementById('cotToggle');
    const cotClose = document.getElementById('cotClose');
    const cotContent = document.getElementById('cotContent');
    const cotBadge = document.getElementById('cotBadge');
    const cotStats = document.getElementById('cotStats');
    const statToolCalls = document.getElementById('statToolCalls');
    const statTotalTime = document.getElementById('statTotalTime');
    const statTokens = document.getElementById('statTokens');
    const agentStatus = document.getElementById('agentStatus');
    const agentStatusText = document.getElementById('agentStatusText');
    const appContainer = document.getElementById('appContainer');

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        initTheme();
        initSettings();
        initCotPanel();
        registerCotEvents();
        if (!apiKey) openSettings();
        if (messages.length === 0) showHome(true);
        userInput.dispatchEvent(new Event('input'));
    }

    // ============================================================
    // 主题
    // ============================================================
    function initTheme() {
        const saved = localStorage.getItem('theme') || 'light';
        applyTheme(saved);
    }
    function applyTheme(t) {
        document.body.className = t === 'dark' ? 'dark-mode' : 'light-mode';
        themeToggle.querySelector('i').className = t === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        localStorage.setItem('theme', t);
    }
    themeToggle.addEventListener('click', () => {
        applyTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });

    // ============================================================
    // 设置弹窗
    // ============================================================
    function initSettings() {
        apiKeyInput.value = apiKey;
        agentModeSelect.value = agentMode;
        maxIterInput.value = maxIter;
    }
    function openSettings() { settingsModal.classList.remove('hidden'); apiKeyInput.focus(); }
    function closeSettings() { settingsModal.classList.add('hidden'); }
    settingsBtn.addEventListener('click', openSettings);
    modalClose.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });
    saveSettings.addEventListener('click', () => {
        const k = apiKeyInput.value.trim();
        if (k) {
            apiKey = k;
            localStorage.setItem('LINGXI_API_KEY', k);
        }
        agentMode = agentModeSelect.value;
        localStorage.setItem('LINGXI_AGENT_MODE', agentMode);
        maxIter = parseInt(maxIterInput.value || '5', 10);
        localStorage.setItem('LINGXI_MAX_ITER', maxIter);
        closeSettings();
        showToast('设置已保存 ✓');
    });

    // ============================================================
    // CoT 面板
    // ============================================================
    function initCotPanel() {
        // 默认关闭（窄屏下）
        cotPanelOpen = window.innerWidth >= 1100;
        setCotPanelState(cotPanelOpen);
    }
    function setCotPanelState(open) {
        cotPanelOpen = open;
        if (open) {
            cotPanel.classList.add('open');
            appContainer.classList.add('cot-open');
            cotToggle.style.display = 'none';
        } else {
            cotPanel.classList.remove('open');
            appContainer.classList.remove('cot-open');
            cotToggle.style.display = '';
        }
    }
    cotToggle.addEventListener('click', () => setCotPanelState(true));
    cotClose.addEventListener('click', () => setCotPanelState(false));

    // 更新徽标数量
    function updateCotBadge(n) {
        if (n > 0) {
            cotBadge.textContent = n;
            cotBadge.classList.remove('hidden');
        } else {
            cotBadge.classList.add('hidden');
        }
    }

    // ============================================================
    // CoT 事件注册（与 CotBus 对接）
    // ============================================================
    function registerCotEvents() {
        CotBus.on('reset', () => {
            cotStepCount = 0;
            updateCotBadge(0);
            cotContent.innerHTML = '<div class="cot-empty"><i class="fas fa-robot" style="font-size:2.5rem;opacity:0.3;"></i><p>智能体正在启动…</p></div>';
            cotStats.classList.add('hidden');
        });

        CotBus.on('start', ({ message }) => {
            cotContent.innerHTML = '';
            appendCotStep('plan', message, null, 'fas fa-lightbulb');
        });

        CotBus.on('thinking', ({ iteration, message }) => {
            appendCotStep('thinking', message, `第 ${iteration} 轮推理`, 'fas fa-brain');
            updateAgentStatus(message);
        });

        CotBus.on('tools_start', ({ tools, count, message }) => {
            appendCotStep('tools', message,
                count > 1 ? `⚡ 并发执行 ${count} 个工具` : null,
                'fas fa-bolt');
            updateAgentStatus(message);
        });

        CotBus.on('tool_start', ({ name, args }) => {
            addToolCard(name, args, 'running');
            cotStepCount++;
            updateCotBadge(cotStepCount);
        });

        CotBus.on('tool_done', ({ name, elapsed, result }) => {
            updateToolCard(name, elapsed, result, 'done');
        });

        CotBus.on('tool_error', ({ name, error }) => {
            updateToolCard(name, null, { error }, 'error');
        });

        CotBus.on('generating', ({ message }) => {
            appendCotStep('generating', message, null, 'fas fa-pen-nib');
            updateAgentStatus('正在生成报告…');
        });

        CotBus.on('done', ({ totalToolCalls, totalTime, totalTokens }) => {
            appendCotStep('done', `分析完成 ✓ 共调用 ${totalToolCalls} 个工具`, `总耗时 ${totalTime}ms`, 'fas fa-check-circle');
            cotStats.classList.remove('hidden');
            statToolCalls.textContent = totalToolCalls;
            statTotalTime.textContent = totalTime >= 1000 ? (totalTime / 1000).toFixed(1) + 's' : totalTime + 'ms';
            statTokens.textContent = totalTokens > 0 ? totalTokens.toLocaleString() : '-';
            hideAgentStatus();
        });

        CotBus.on('aborted', ({ message }) => {
            appendCotStep('warn', message, null, 'fas fa-hand-paper');
            hideAgentStatus();
        });

        CotBus.on('error', ({ message }) => {
            appendCotStep('error', '错误：' + message, null, 'fas fa-exclamation-triangle');
            hideAgentStatus();
        });

        CotBus.on('warning', ({ message }) => {
            appendCotStep('warn', message, null, 'fas fa-exclamation-circle');
        });
    }

    // 向 CoT 面板追加步骤
    function appendCotStep(type, text, sub, icon) {
        // 移除 empty 占位
        const empty = cotContent.querySelector('.cot-empty');
        if (empty) empty.remove();

        const step = document.createElement('div');
        step.className = `cot-step cot-step-${type}`;
        step.innerHTML = `
            <div class="cot-step-icon"><i class="${icon || 'fas fa-circle'}"></i></div>
            <div class="cot-step-body">
                <div class="cot-step-text">${escapeHtml(text)}</div>
                ${sub ? `<div class="cot-step-sub">${escapeHtml(sub)}</div>` : ''}
            </div>
        `;
        cotContent.appendChild(step);
        cotContent.scrollTop = cotContent.scrollHeight;

        // 入场动画
        requestAnimationFrame(() => step.classList.add('visible'));

        // 自动展开面板
        if (!cotPanelOpen) {
            cotStepCount++;
            updateCotBadge(cotStepCount);
        }
    }

    // 工具执行卡片
    const toolCardMap = {};
    function addToolCard(name, args, status) {
        const empty = cotContent.querySelector('.cot-empty');
        if (empty) empty.remove();

        const card = document.createElement('div');
        card.className = `tool-card tool-card-${status}`;
        card.id = `tool-card-${name}-${Date.now()}`;

        const argsStr = JSON.stringify(args, null, 2);
        card.innerHTML = `
            <div class="tool-card-header">
                <span class="tool-badge"><i class="fas fa-wrench"></i> ${escapeHtml(name)}</span>
                <span class="tool-status ${status}">${status === 'running' ? '<i class="fas fa-spinner fa-spin"></i> 执行中' : ''}</span>
            </div>
            <div class="tool-card-args">
                <pre>${escapeHtml(argsStr)}</pre>
            </div>
            <div class="tool-card-result hidden"></div>
        `;
        cotContent.appendChild(card);
        toolCardMap[name] = card;
        cotContent.scrollTop = cotContent.scrollHeight;
        requestAnimationFrame(() => card.classList.add('visible'));
    }

    function updateToolCard(name, elapsed, result, status) {
        const card = toolCardMap[name];
        if (!card) return;

        card.className = `tool-card tool-card-${status} visible`;
        const statusEl = card.querySelector('.tool-status');
        if (statusEl) {
            statusEl.className = `tool-status ${status}`;
            statusEl.innerHTML = status === 'done'
                ? `<i class="fas fa-check"></i> ${elapsed ? elapsed + 'ms' : '完成'}`
                : `<i class="fas fa-times"></i> 失败`;
        }

        const resultEl = card.querySelector('.tool-card-result');
        if (resultEl && result) {
            resultEl.classList.remove('hidden');
            const preview = getResultPreview(result);
            resultEl.innerHTML = `<div class="tool-result-preview">${preview}</div>`;
        }
        cotContent.scrollTop = cotContent.scrollHeight;
    }

    // 提取工具结果的简短预览
    function getResultPreview(result) {
        if (result.error) return `<span class="result-error">错误: ${escapeHtml(result.error)}</span>`;
        if (result.report_markdown) return `<span class="result-ok">📄 报告已生成，${result.word_count || 0} 字</span>`;
        if (result.results && Array.isArray(result.results)) {
            return `<span class="result-ok">📊 分析 ${result.total} 条，成功 ${result.success} 条，耗时 ${result.elapsed_ms}ms</span>`;
        }
        if (result.data) {
            const preview = String(result.data).slice(0, 80).replace(/\n/g, ' ');
            return `<span class="result-ok">✓ ${escapeHtml(preview)}…</span>`;
        }
        return `<span class="result-ok">✓ 完成</span>`;
    }

    // Agent 状态栏
    function updateAgentStatus(text) {
        agentStatus.classList.remove('hidden');
        agentStatusText.textContent = text;
    }
    function hideAgentStatus() {
        agentStatus.classList.add('hidden');
    }

    // ============================================================
    // 视图切换
    // ============================================================
    function showHome(flag) {
        homeSection.classList.toggle('hidden', !flag);
        messageSection.classList.toggle('hidden', flag);
    }

    function clearConversation() {
        messages = [];
        renderMessageList();
        showHome(true);
        userInput.value = '';
        clearImagePreview();
        cotContent.innerHTML = '<div class="cot-empty"><i class="fas fa-robot" style="font-size:2.5rem;opacity:0.3;"></i><p>等待智能体开始思考…</p></div>';
        cotStats.classList.add('hidden');
        cotStepCount = 0;
        updateCotBadge(0);
        hideAgentStatus();
        userInput.dispatchEvent(new Event('input'));
    }
    clearBtn.addEventListener('click', clearConversation);

    // ============================================================
    // 消息渲染
    // ============================================================
    function renderMessageList() {
        messageList.innerHTML = '';
        messages.forEach(msg => {
            if (msg.role === 'tool' || msg.role === 'system') return; // 不渲染系统/工具消息
            messageList.appendChild(createMessageElement(msg));
        });
        scrollToBottom();
    }

    function scrollToBottom() {
        const main = document.querySelector('.main-content');
        if (main) main.scrollTop = main.scrollHeight;
    }

    function createMessageElement(msg) {
        const div = document.createElement('div');
        div.className = `message ${msg.role === 'assistant' ? 'ai' : msg.role}`;

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = msg.role === 'user'
            ? '<i class="fa-regular fa-user"></i>'
            : '<i class="fas fa-robot"></i>';
        div.appendChild(avatar);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (msg.role === 'user' && Array.isArray(msg.content)) {
            msg.content.forEach(part => {
                if (part.type === 'text') {
                    const p = document.createElement('p');
                    p.textContent = part.text;
                    contentDiv.appendChild(p);
                } else if (part.type === 'image_url') {
                    const img = document.createElement('img');
                    img.src = part.image_url.url;
                    img.className = 'user-image';
                    contentDiv.appendChild(img);
                }
            });
        } else {
            const text = typeof msg.content === 'string' ? msg.content : '';
            if (msg.role === 'assistant' || msg.role === 'ai') {
                const rendered = marked.parse(text);
                contentDiv.innerHTML = rendered;
                contentDiv.querySelectorAll('pre code').forEach(block => {
                    hljs.highlightElement(block);
                    if (!block.parentNode.querySelector('.copy-btn')) {
                        const btn = document.createElement('button');
                        btn.className = 'copy-btn';
                        btn.innerHTML = '<i class="fa-regular fa-copy"></i> 复制';
                        btn.onclick = () => {
                            navigator.clipboard.writeText(block.innerText).then(() => {
                                btn.innerHTML = '<i class="fa-regular fa-check"></i> 已复制';
                                setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> 复制', 1500);
                            });
                        };
                        block.parentNode.style.position = 'relative';
                        block.parentNode.appendChild(btn);
                    }
                });
            } else {
                contentDiv.textContent = text;
            }
        }

        div.appendChild(contentDiv);
        return div;
    }

    // ============================================================
    // 图片上传
    // ============================================================
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = ev => {
            selectedImageBase64 = ev.target.result.split(',')[1];
            selectedImageType = file.type;
            imagePreview.src = ev.target.result;
            previewContainer.classList.remove('hidden');
            userInput.dispatchEvent(new Event('input'));
        };
        reader.readAsDataURL(file);
    });
    removeImageBtn.addEventListener('click', clearImagePreview);
    function clearImagePreview() {
        selectedImageBase64 = '';
        selectedImageType = '';
        previewContainer.classList.add('hidden');
        imagePreview.src = '';
        fileInput.value = '';
    }

    // ============================================================
    // 构建用户消息内容
    // ============================================================
    function buildUserContent() {
        const text = userInput.value.trim();
        if (!text && !selectedImageBase64) return null;
        const arr = [];
        if (text) arr.push({ type: 'text', text });
        if (selectedImageBase64) arr.push({ type: 'image_url', image_url: { url: `data:${selectedImageType};base64,${selectedImageBase64}` } });
        return arr;
    }

    // ============================================================
    // 发送消息 & Agent 调度
    // ============================================================
    async function sendMessage() {
        if (isLoading) return;
        if (!apiKey) { openSettings(); return; }

        const content = buildUserContent();
        if (!content) return;

        showHome(false);

        // 添加用户消息到历史
        const userMsg = { role: 'user', content };
        messages.push(userMsg);
        renderMessageList();

        userInput.value = '';
        clearImagePreview();
        userInput.style.height = 'auto';
        userInput.dispatchEvent(new Event('input'));

        // 创建一条空的 AI 消息用于流式填充
        const aiMsg = { role: 'assistant', content: '' };
        messages.push(aiMsg);
        renderMessageList();

        isLoading = true;
        toggleButtons(true);
        updateAgentStatus('智能体启动中…');

        // 自动展开 CoT 面板
        if (!cotPanelOpen) setCotPanelState(true);

        // 构建发送给 Agent 的历史（去掉最后那条空 AI 消息）
        const historyForAgent = messages
            .slice(0, -1) // 不含空 AI 消息
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
                role: m.role,
                content: m.content
            }));

        // 创建 Agent 实例
        agent = new FinancialAgent(apiKey, agentMode, maxIter);

        try {
            await agent.run(
                historyForAgent,
                // 流式 delta 回调
                (delta) => {
                    aiMsg.content += delta;
                    updateLastAIMessage(aiMsg.content);
                },
                // 最终消息回调
                (finalText) => {
                    aiMsg.content = finalText;
                    renderMessageList();
                }
            );
        } catch (err) {
            if (err.name !== 'AbortError') {
                aiMsg.content = `**错误**：${err.message}\n\n请检查 API Key 是否正确，或稍后重试。`;
                renderMessageList();
            }
        } finally {
            isLoading = false;
            agent = null;
            toggleButtons(false);
            hideAgentStatus();
        }
    }

    // 实时更新最后一条 AI 消息（流式）
    function updateLastAIMessage(text) {
        const lastEl = messageList.lastElementChild;
        if (!lastEl || !lastEl.classList.contains('ai') && !lastEl.classList.contains('assistant')) return;
        const contentDiv = lastEl.querySelector('.message-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = marked.parse(text);
        scrollToBottom();
    }

    function toggleButtons(loading) {
        sendBtn.classList.toggle('hidden', loading);
        stopBtn.classList.toggle('hidden', !loading);
    }

    stopBtn.addEventListener('click', () => {
        if (agent) agent.abort();
        isLoading = false;
        toggleButtons(false);
        hideAgentStatus();
    });

    // ============================================================
    // 输入框事件
    // ============================================================
    userInput.addEventListener('input', () => {
        const hasContent = userInput.value.trim() || selectedImageBase64;
        sendBtn.classList.toggle('hidden', !hasContent || isLoading);
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
    });

    userInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isLoading && (userInput.value.trim() || selectedImageBase64)) sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);

    // 快捷卡片
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.dataset.prompt;
            if (prompt) {
                userInput.value = prompt;
                userInput.dispatchEvent(new Event('input'));
                sendMessage();
            }
        });
    });

    // ============================================================
    // Toast 通知
    // ============================================================
    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 300);
        }, 2000);
    }

    // ============================================================
    // 工具函数
    // ============================================================
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 挂载到全局（供 agent.js sleep 使用）
    window.sleep = function (ms) { return new Promise(r => setTimeout(r, ms)); };

    // ============================================================
    // 启动
    // ============================================================
    init();
})();
