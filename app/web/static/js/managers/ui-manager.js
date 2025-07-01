/**
 * ChatGPT风格的UI管理器
 * 协调所有UI组件，处理界面状态管理
 */
class UIManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.components = {};
        this.isInitialized = false;

        this.initializeComponents();
        this.setupEventListeners();
    }

    /**
     * 初始化所有组件
     */
    initializeComponents() {
        try {
            // 初始化聊天组件
            this.components.chat = new ChatComponent();
            console.log('✅ 聊天组件初始化成功');

            // 初始化输入组件
            this.components.input = new InputComponent();
            console.log('✅ 输入组件初始化成功');

            // 初始化侧边栏组件
            this.components.sidebar = new SidebarComponent();
            console.log('✅ 侧边栏组件初始化成功');

            // 初始化通知组件
            this.components.notification = new NotificationComponent(this.eventBus);
            console.log('✅ 通知组件初始化成功');

            this.isInitialized = true;
            console.log('🎉 所有UI组件初始化完成');

        } catch (error) {
            console.error('❌ UI组件初始化失败:', error);
        }
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 聊天相关事件
        this.eventBus.on('chat:new', () => {
            this.handleNewChat();
        });

        this.eventBus.on('chat:load', (data) => {
            this.handleLoadChat(data);
        });

        // 消息发送事件
        this.eventBus.on('message:send', (data) => {
            this.handleMessageSend(data);
        });

        // 分析状态事件
        this.eventBus.on('analysis:started', () => {
            this.setAnalysisState(true);
        });

        this.eventBus.on('analysis:completed', () => {
            this.setAnalysisState(false);
        });

        this.eventBus.on('analysis:error', () => {
            this.setAnalysisState(false);
        });

        // WebSocket连接状态事件
        this.eventBus.on('websocket:connected', () => {
            this.updateConnectionStatus(true);
        });

        this.eventBus.on('websocket:disconnected', () => {
            this.updateConnectionStatus(false);
        });

        // 错误处理
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event);
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.handleUnhandledRejection(event);
        });
    }

    /**
     * 处理新聊天
     */
    handleNewChat() {
        if (this.components.chat) {
            this.components.chat.clearMessages();
        }
        console.log('🆕 开始新聊天');
    }

    /**
     * 处理加载聊天
     */
    handleLoadChat(data) {
        if (this.components.chat && data.messages) {
            this.components.chat.clearMessages();

            // 重新显示历史消息
            data.messages.forEach(message => {
                if (message.type === 'user') {
                    this.components.chat.addUserMessage(message.content, new Date(message.timestamp));
                } else if (message.type === 'assistant') {
                    this.components.chat.addAssistantMessage(message.content, new Date(message.timestamp));
                }
            });
        }
        console.log('📂 加载历史聊天完成');
    }

    /**
     * 处理消息发送
     */
    handleMessageSend(data) {
        // 获取选择的分析模式
        const analysisMode = this.components.input?.getAnalysisMode() || 'planning';

        // 触发分析请求
        this.eventBus.emit('analysis:request', {
            prompt: data.content,
            flowType: analysisMode,
            timestamp: data.timestamp
        });

        console.log(`📤 发送消息: ${data.content.substring(0, 50)}...`);
    }

    /**
     * 设置分析状态
     */
    setAnalysisState(isAnalyzing) {
        // 输入组件已经通过事件监听处理状态
        console.log(`🤖 分析状态: ${isAnalyzing ? '进行中' : '已完成'}`);
    }

    /**
     * 更新连接状态
     */
    updateConnectionStatus(isConnected) {
        const status = isConnected ? '已连接' : '未连接';
        console.log(`🔗 WebSocket状态: ${status}`);

        if (!isConnected) {
            this.showNotification({
                message: '与服务器的连接已断开，正在尝试重新连接...',
                type: 'warning',
                duration: 3000
            });
        }
    }

    /**
     * 显示通知
     */
    showNotification(options) {
        if (this.components.notification) {
            // 允许既可以传字符串，也可以传完整对象
            if (typeof options === 'string') {
                this.components.notification.show(options, 'info', 3000);
            } else if (options && typeof options === 'object') {
                const { message = '', type = 'info', duration = 3000 } = options;
                this.components.notification.show(message, type, duration);
            }
        }
    }

    /**
     * 处理全局错误
     */
    handleGlobalError(event) {
        console.error('❌ 全局错误:', event.error);

        this.showNotification({
            message: '发生了未知错误，请刷新页面重试',
            type: 'error',
            duration: 5000
        });
    }

    /**
     * 处理未捕获的Promise拒绝
     */
    handleUnhandledRejection(event) {
        console.error('❌ 未处理的Promise拒绝:', event.reason);

        this.showNotification({
            message: '操作失败，请重试',
            type: 'error',
            duration: 3000
        });

        event.preventDefault(); // 防止默认错误处理
    }

    /**
     * 获取组件实例
     */
    getComponent(name) {
        return this.components[name];
    }

    /**
     * 检查组件是否已初始化
     */
    isComponentReady(name) {
        return this.components[name] && this.isInitialized;
    }

    /**
     * 销毁所有组件
     */
    destroy() {
        Object.values(this.components).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });

        this.components = {};
        this.isInitialized = false;
        console.log('🧹 UI管理器已销毁');
    }

    /**
     * 重新初始化
     */
    reinitialize() {
        this.destroy();
        this.initializeComponents();
        console.log('🔄 UI管理器重新初始化完成');
    }
}

// 导出给全局使用
window.UIManager = UIManager;
