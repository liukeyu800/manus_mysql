/**
 * 会话管理器 - 处理分析会话
 */
class SessionManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.currentSession = null;
        this.currentWorkspace = null;
        this.apiBase = '/api';

        this.bindEvents();
    }

    bindEvents() {
        // 监听会话创建请求
        this.eventBus.on('session:create', (data) => {
            this.createSession(data);
        });
    }

    /**
     * 创建新会话
     * @param {Object} data 会话数据
     */
    async createSession(data) {
        const { prompt, flowType } = data;

        try {
            const response = await fetch(`${this.apiBase}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    flow_type: flowType
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const sessionData = await response.json();
            this.currentSession = sessionData.session_id;
            this.currentWorkspace = sessionData.workspace;

            console.log('✅ 分析已启动:', sessionData);

            // 触发会话创建成功事件
            this.eventBus.emit('session:created', sessionData);

        } catch (error) {
            console.error('❌ 分析启动失败:', error);
            this.eventBus.emit('error', { message: '分析启动失败: ' + error.message });
        }
    }

    /**
     * 创建分析会话（新版本接口，兼容ChatGPT风格）
     * @param {Object} data 分析数据
     */
    async createAnalysisSession(data) {
        return this.createSession(data);
    }



    /**
     * 获取会话状态
     */
    async getSessionStatus() {
        if (!this.currentSession) return null;

        try {
            const response = await fetch(`${this.apiBase}/chat/${this.currentSession}/status`);

            if (response.ok) {
                return await response.json();
            } else {
                throw new Error(`获取状态失败: ${response.status}`);
            }
        } catch (error) {
            console.error('❌ 获取会话状态失败:', error);
            return null;
        }
    }

    /**
     * 提交用户输入
     * @param {string} input 用户输入
     */
    async submitUserInput(input) {
        if (!this.currentSession) {
            throw new Error('没有正在进行的分析');
        }

        try {
            const response = await fetch(`${this.apiBase}/chat/${this.currentSession}/input`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: input }),
            });

            if (!response.ok) {
                throw new Error(`提交输入失败: ${response.status}`);
            }

            console.log('✅ 用户输入已提交');
            this.eventBus.emit('session:input_submitted');

        } catch (error) {
            console.error('❌ 提交用户输入失败:', error);
            this.eventBus.emit('error', { message: '提交输入失败: ' + error.message });
        }
    }

    /**
     * 重置会话
     */
    reset() {
        this.currentSession = null;
        this.currentWorkspace = null;
    }

    /**
     * 获取当前会话信息
     */
    getCurrentSession() {
        return {
            sessionId: this.currentSession,
            workspace: this.currentWorkspace
        };
    }
}
