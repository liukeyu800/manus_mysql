/**
 * ChatGPT风格的聊天组件
 * 处理消息显示、欢迎界面、对话历史等
 */
class ChatComponent {
    constructor() {
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.chatContent = document.getElementById('chatContent');

        this.messages = [];
        this.currentTypingIndicator = null;
        this.pendingAssistant = null;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // 监听消息发送事件
        window.eventBus.on('message:send', (data) => {
            this.addUserMessage(data.content, data.timestamp);
            this.hideWelcomeScreen();
            // 开始新的助手思考气泡
            this.startAssistantThinking();
        });

        // 监听推理进度/日志
        window.eventBus.on('analysis:progress', (data) => {
            this.appendAssistantDetail(data.content);
        });

        // 监听最终结果
        window.eventBus.on('analysis:final', (data) => {
            this.finalizeAssistantMessage(data.content, data.timestamp);
        });

        // 监听分析错误事件
        window.eventBus.on('analysis:error', (data) => {
            this.finalizeAssistantMessage(data.message || '分析过程中发生错误，请重试。');
        });

        // 绑定快速示例按钮事件
        this.bindQuickExampleButtons();
    }

    /**
     * 绑定快速示例按钮事件
     */
    bindQuickExampleButtons() {
        const quickExampleButtons = document.querySelectorAll('.quick-example-btn');
        quickExampleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const example = button.textContent.trim();
                window.eventBus.emit('input:set', { text: example });
            });
        });
    }

    /**
     * 添加用户消息
     */
    addUserMessage(content, timestamp = new Date()) {
        const message = {
            id: this.generateMessageId(),
            type: 'user',
            content: content,
            timestamp: timestamp
        };

        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
    }

    /**
     * 添加助手消息
     */
    addAssistantMessage(content, timestamp = new Date()) {
        const message = {
            id: this.generateMessageId(),
            type: 'assistant',
            content: content,
            timestamp: timestamp
        };

        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
    }

    /**
     * 添加错误消息
     */
    addErrorMessage(content, timestamp = new Date()) {
        const message = {
            id: this.generateMessageId(),
            type: 'error',
            content: content,
            timestamp: timestamp
        };

        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
    }

    /**
     * 渲染消息
     */
    renderMessage(message) {
        const messageElement = this.createMessageElement(message);
        this.messagesContainer.appendChild(messageElement);
    }

    /**
     * 创建消息元素
     */
    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}`;
        messageDiv.setAttribute('data-message-id', message.id);

        const avatar = this.createAvatar(message.type);
        const content = this.createMessageContent(message);

        if (message.type === 'user') {
            messageDiv.appendChild(content);
            messageDiv.appendChild(avatar);
        } else {
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(content);
        }

        return messageDiv;
    }

    /**
     * 创建头像
     */
    createAvatar(type) {
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';

        if (type === 'user') {
            avatar.textContent = '您';
        } else if (type === 'error') {
            avatar.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        } else {
            avatar.innerHTML = '<i class="fas fa-robot"></i>';
        }

        return avatar;
    }

    /**
     * 创建消息内容
     */
    createMessageContent(message) {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        if (message.type === 'error') {
            bubble.style.background = 'var(--error-color)';
            bubble.style.color = 'white';
        }

        // 处理内容格式
        bubble.innerHTML = this.formatMessageContent(message.content);

        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = this.formatTime(message.timestamp);

        contentDiv.appendChild(bubble);
        contentDiv.appendChild(time);

        return contentDiv;
    }

    /**
     * 格式化消息内容
     */
    formatMessageContent(content) {
        // 简单的格式化，支持换行
        return content
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }

    /**
     * 格式化时间
     */
    formatTime(timestamp) {
        const now = new Date();
        const messageTime = new Date(timestamp);

        const isToday = now.toDateString() === messageTime.toDateString();

        if (isToday) {
            return messageTime.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            return messageTime.toLocaleDateString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    /**
     * 显示打字指示器
     */
    showTypingIndicator() {
        if (this.currentTypingIndicator) {
            return; // 已经在显示了
        }

        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant';
        typingDiv.id = 'typing-indicator';

        const avatar = this.createAvatar('assistant');
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';

        contentDiv.appendChild(indicator);
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(contentDiv);

        this.messagesContainer.appendChild(typingDiv);
        this.currentTypingIndicator = typingDiv;
        this.scrollToBottom();
    }

    /**
     * 隐藏打字指示器
     */
    hideTypingIndicator() {
        if (this.currentTypingIndicator) {
            this.currentTypingIndicator.remove();
            this.currentTypingIndicator = null;
        }
    }

    /**
     * 隐藏欢迎界面
     */
    hideWelcomeScreen() {
        if (this.welcomeScreen.style.display !== 'none') {
            this.welcomeScreen.style.display = 'none';
            this.messagesContainer.style.display = 'flex';
        }
    }

    /**
     * 显示欢迎界面
     */
    showWelcomeScreen() {
        this.welcomeScreen.style.display = 'flex';
        this.messagesContainer.style.display = 'none';
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        setTimeout(() => {
            this.chatContent.scrollTop = this.chatContent.scrollHeight;
        }, 100);
    }

    /**
     * 生成消息ID
     */
    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 清除所有消息
     */
    clearMessages() {
        this.messages = [];
        this.messagesContainer.innerHTML = '';
        this.showWelcomeScreen();
        this.hideTypingIndicator();
    }

    /**
     * 获取所有消息
     */
    getMessages() {
        return [...this.messages];
    }

    /**
     * 更新最后一条助手消息（用于流式响应）
     */
    updateLastAssistantMessage(content) {
        const lastMessage = this.messages[this.messages.length - 1];
        if (lastMessage && lastMessage.type === 'assistant') {
            lastMessage.content = content;
            const messageElement = this.messagesContainer.querySelector(`[data-message-id="${lastMessage.id}"] .message-bubble`);
            if (messageElement) {
                messageElement.innerHTML = this.formatMessageContent(content);
            }
        }
    }

    /**
     * 创建一个助手思考气泡，占位等待最终答案
     */
    startAssistantThinking() {
        // 如果已有未完成的助手消息，不再重复创建
        if (this.pendingAssistant) return;

        const message = {
            id: this.generateMessageId(),
            type: 'assistant',
            content: '🤔 AI 正在思考...',
            timestamp: new Date(),
            details: []
        };

        this.pendingAssistant = message;
        this.messages.push(message);

        const element = this.createAssistantThinkingElement(message);
        this.messagesContainer.appendChild(element);
        this.scrollToBottom();
    }

    /**
     * 向助手思考气泡追加详细过程
     */
    appendAssistantDetail(detail) {
        if (!this.pendingAssistant) return;
        this.pendingAssistant.details.push(detail);

        const detailsDiv = document.querySelector(`[data-message-id="${this.pendingAssistant.id}"] .detail-lines`);
        if (detailsDiv) {
            const line = document.createElement('div');
            line.className = 'detail-line';
            line.textContent = detail;
            detailsDiv.appendChild(line);
            this.scrollToBottom();
        }
    }

    /**
     * 完成助手消息，将最终结果显示，并保留可展开的思考过程
     */
    finalizeAssistantMessage(content, timestamp = new Date()) {
        if (!this.pendingAssistant) {
            // 如果没有待定助手消息，直接添加普通助手消息
            this.addAssistantMessage(content, timestamp);
            return;
        }

        this.pendingAssistant.content = content;
        this.pendingAssistant.timestamp = timestamp;

        const messageDiv = document.querySelector(`[data-message-id="${this.pendingAssistant.id}"]`);
        if (messageDiv) {
            // 更新主摘要内容
            const summaryDiv = messageDiv.querySelector('.assistant-summary');
            if (summaryDiv) {
                summaryDiv.innerHTML = this.formatMessageContent(content);
            }

            // 更新时间
            const timeDiv = messageDiv.querySelector('.message-time');
            if (timeDiv) {
                timeDiv.textContent = this.formatTime(timestamp);
            }
        }

        // 清除标记
        this.pendingAssistant = null;
        this.scrollToBottom();
    }

    /**
     * 创建助手思考气泡的 DOM
     */
    createAssistantThinkingElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messageDiv.setAttribute('data-message-id', message.id);

        const avatar = this.createAvatar('assistant');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const summary = document.createElement('div');
        summary.className = 'assistant-summary';
        summary.textContent = message.content;

        const details = document.createElement('details');
        details.className = 'assistant-details';
        const summaryToggle = document.createElement('summary');
        summaryToggle.textContent = '查看推理过程';
        const detailsLines = document.createElement('div');
        detailsLines.className = 'detail-lines';
        details.appendChild(summaryToggle);
        details.appendChild(detailsLines);

        bubble.appendChild(summary);
        bubble.appendChild(details);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = this.formatTime(message.timestamp);

        contentDiv.appendChild(bubble);
        contentDiv.appendChild(timeDiv);

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);

        return messageDiv;
    }
}

// 导出给全局使用
window.ChatComponent = ChatComponent;
