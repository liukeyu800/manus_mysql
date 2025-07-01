/**
 * ChatGPT风格智能分析平台主应用
 * 协调各个管理器和组件，处理应用级事件
 */
class AnalysisPlatformApp {
    constructor() {
        this.managers = {};
        this.isInitialized = false;
        this.config = {
            websocketReconnectDelay: 3000,
            websocketMaxRetries: 5
        };

        this.init();
    }

    /**
     * 初始化应用
     */
    async init() {
        try {
            console.log('🚀 启动智能分析平台...');

            // 初始化事件总线
            this.initEventBus();

            // 等待DOM完全加载
            await this.waitForDOM();

            // 初始化管理器
            this.initializeManagers();

            // 设置全局错误处理
            this.setupErrorHandling();

            this.isInitialized = true;
            console.log('✅ 应用初始化完成');

            // 触发应用就绪事件
            window.eventBus.emit('app:ready');

        } catch (error) {
            console.error('❌ 应用初始化失败:', error);
            this.handleInitializationError(error);
        }
    }

    /**
     * 初始化事件总线
     */
    initEventBus() {
        if (!window.eventBus) {
            window.eventBus = new EventBus();
            console.log('✅ 事件总线初始化完成');
        }
    }

    /**
     * 等待DOM加载完成
     */
    waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }

    /**
     * 初始化管理器
     */
    initializeManagers() {
        // 初始化UI管理器
        this.managers.ui = new UIManager(window.eventBus);
        console.log('✅ UI管理器初始化完成');

        // 初始化WebSocket管理器
        this.managers.websocket = new WebSocketManager(window.eventBus);
        console.log('✅ WebSocket管理器初始化完成');

        // 初始化会话管理器
        this.managers.session = new SessionManager(window.eventBus);
        console.log('✅ 会话管理器初始化完成');

        // 设置管理器间的协调
        this.setupManagerCoordination();
    }

    /**
     * 设置管理器间的协调
     */
    setupManagerCoordination() {
        // 监听分析请求
        window.eventBus.on('analysis:request', (data) => {
            this.handleAnalysisRequest(data);
        });

        // 监听会话创建成功
        window.eventBus.on('session:created', (sessionData) => {
            this.handleSessionCreated(sessionData);
        });

        // 监听WebSocket消息
        window.eventBus.on('websocket:message', (message) => {
            this.handleWebSocketMessage(message);
        });

        // 监听连接状态变化
        window.eventBus.on('websocket:connected', () => {
            console.log('🔗 WebSocket连接已建立');
        });

        window.eventBus.on('websocket:disconnected', () => {
            console.log('⚠️ WebSocket连接已断开');
        });
    }

    /**
     * 处理分析请求
     */
    async handleAnalysisRequest(data) {
        try {
            console.log('🔍 开始处理分析请求:', data.prompt.substring(0, 50) + '...');

            // 触发分析开始事件
            window.eventBus.emit('analysis:started');

            // 通过会话管理器创建分析会话
            await this.managers.session.createAnalysisSession({
                prompt: data.prompt,
                flowType: data.flowType
            });

        } catch (error) {
            console.error('❌ 处理分析请求失败:', error);
            window.eventBus.emit('analysis:error', {
                message: error.message || '分析请求处理失败'
            });
        }
    }

    /**
     * 处理会话创建成功
     */
    handleSessionCreated(sessionData) {
        console.log('🎉 会话创建成功:', sessionData);

        // 连接WebSocket
        if (this.managers.websocket && sessionData.session_id) {
            this.managers.websocket.connect(sessionData.session_id);
        }
    }

    /**
     * 处理WebSocket消息
     */
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'progress':
            case 'progress_update':
                this.handleProgressMessage(message);
                break;

            case 'log':
            case 'tool_call_log':
                this.handleLogMessage(message);
                break;

            case 'result':
            case 'task_completed':
                this.handleResultMessage(message);
                break;

            case 'complete':
                this.handleCompleteMessage(message);
                break;

            case 'error':
            case 'task_cancelled':
                this.handleErrorMessage(message);
                break;

            case 'user_input_request':
                this.handleUserInputRequest(message);
                break;

            case 'connection_established':
                // 可忽略或显示连接信息
                console.log('WebSocket连接已建立');
                break;

            default:
                console.log('📩 收到未知消息类型:', message.type);
        }
    }

    /**
     * 处理进度消息
     */
    handleProgressMessage(data) {
        console.log('📊 分析进度:', data);

        const content = data.step_info ? `进度: ${data.progress || data.percent || 0}% - ${data.step_info}` : `进度: ${data.progress || data.percent || 0}%`;

        // 推送到前端用于折叠显示
        window.eventBus.emit('analysis:progress', {
            content,
            timestamp: new Date()
        });
    }

    /**
     * 处理日志消息
     */
    handleLogMessage(data) {
        let content = '';
        if (typeof data === 'string') {
            content = data;
        } else if (data.message) {
            content = data.message;
        } else {
            content = JSON.stringify(data);
        }

        window.eventBus.emit('analysis:progress', {
            content,
            timestamp: new Date()
        });
    }

    /**
     * 处理结果消息
     */
    handleResultMessage(data) {
        console.log('📋 分析结果:', data);

        window.eventBus.emit('analysis:final', {
            content: data.content || data.result || '分析完成',
            timestamp: new Date()
        });
    }

    /**
     * 处理完成消息
     */
    handleCompleteMessage(data) {
        console.log('✅ 分析完成:', data);

        window.eventBus.emit('analysis:completed');

        if (data.final_result || data.result) {
            window.eventBus.emit('analysis:final', {
                content: data.final_result || data.result,
                timestamp: new Date()
            });
        }
    }

    /**
     * 处理错误消息
     */
    handleErrorMessage(data) {
        console.error('❌ 分析错误:', data);

        window.eventBus.emit('analysis:error', {
            message: data.error || data.message || '分析过程中发生错误'
        });
    }

    /**
     * 处理用户输入请求
     */
    handleUserInputRequest(data) {
        console.log('💬 用户输入请求:', data);

        // 这里可以实现用户确认对话框
        // 暂时自动确认
        if (this.managers.websocket) {
            this.managers.websocket.send({
                type: 'user_input_response',
                response: data.default || 'yes'
            });
        }
    }

    /**
     * 设置全局错误处理
     */
    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            console.error('全局错误:', event.error);
            this.handleGlobalError(event.error);
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('未处理的Promise拒绝:', event.reason);
            this.handleGlobalError(event.reason);
        });
    }

    /**
     * 处理全局错误
     */
    handleGlobalError(error) {
        if (this.managers.ui) {
            this.managers.ui.showNotification({
                message: '发生了未知错误，请刷新页面重试',
                type: 'error',
                duration: 5000
            });
        }
    }

    /**
     * 处理初始化错误
     */
    handleInitializationError(error) {
        const errorMessage = document.createElement('div');
        errorMessage.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fee2e2;
            color: #dc2626;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #fecaca;
            max-width: 400px;
            text-align: center;
            z-index: 9999;
        `;
        errorMessage.innerHTML = `
            <h3>应用初始化失败</h3>
            <p>${error.message || '未知错误'}</p>
            <button onclick="window.location.reload()" style="
                margin-top: 10px;
                padding: 8px 16px;
                background: #dc2626;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            ">刷新页面</button>
        `;
        document.body.appendChild(errorMessage);
    }

    /**
     * 获取管理器实例
     */
    getManager(name) {
        return this.managers[name];
    }

    /**
     * 检查应用是否已初始化
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * 销毁应用
     */
    destroy() {
        // 销毁所有管理器
        Object.values(this.managers).forEach(manager => {
            if (manager && typeof manager.destroy === 'function') {
                manager.destroy();
            }
        });

        this.managers = {};
        this.isInitialized = false;

        console.log('🧹 应用已销毁');
    }
}

// 创建并启动应用
window.addEventListener('DOMContentLoaded', () => {
    window.app = new AnalysisPlatformApp();
});

// 导出给全局使用
window.AnalysisPlatformApp = AnalysisPlatformApp;
