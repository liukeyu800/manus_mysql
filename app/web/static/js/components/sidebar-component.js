/**
 * ChatGPT风格的侧边栏组件
 * 处理对话历史、新聊天按钮、侧边栏切换等
 */
class SidebarComponent {
    constructor() {
        this.sidebar = document.getElementById('sidebar');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.todayHistory = document.getElementById('todayHistory');
        this.helpBtn = document.getElementById('helpBtn');

        this.chatHistory = this.loadChatHistory();
        this.currentChatId = null;

        this.initializeEventListeners();
        this.renderHistory();
    }

    initializeEventListeners() {
        // 新聊天按钮
        this.newChatBtn.addEventListener('click', () => {
            this.startNewChat();
        });

        // 侧边栏切换（移动端）
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        // 帮助按钮
        this.helpBtn.addEventListener('click', () => {
            this.showHelp();
        });

        // 监听聊天相关事件
        window.eventBus.on('message:send', (data) => {
            this.updateCurrentChatHistory(data);
        });

        window.eventBus.on('message:response', (data) => {
            this.updateCurrentChatHistory(data);
        });

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // 点击其他区域关闭侧边栏（移动端）
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 &&
                !this.sidebar.contains(e.target) &&
                this.sidebarToggle && !this.sidebarToggle.contains(e.target)) {
                this.closeSidebar();
            }
        });
    }

    /**
     * 开始新聊天
     */
    startNewChat() {
        // 保存当前聊天
        if (this.currentChatId) {
            this.saveChatHistory();
        }

        // 创建新聊天ID
        this.currentChatId = this.generateChatId();

        // 清空聊天界面
        window.eventBus.emit('chat:new');

        // 更新历史记录显示
        this.renderHistory();

        // 关闭侧边栏（移动端）
        if (window.innerWidth <= 768) {
            this.closeSidebar();
        }
    }

    /**
     * 切换侧边栏
     */
    toggleSidebar() {
        this.sidebar.classList.toggle('open');
    }

    /**
     * 关闭侧边栏
     */
    closeSidebar() {
        this.sidebar.classList.remove('open');
    }

    /**
     * 显示帮助
     */
    showHelp() {
        const helpContent = `
            <div class="help-content">
                <h3>智能数据分析助手</h3>
                <p>我可以帮助您：</p>
                <ul>
                    <li>分析数据库表结构和关系</li>
                    <li>检查数据质量问题</li>
                    <li>生成数据可视化图表</li>
                    <li>执行复杂的数据分析任务</li>
                    <li>生成分析报告</li>
                </ul>

                <h4>使用技巧：</h4>
                <ul>
                    <li>描述具体的分析需求</li>
                    <li>选择合适的分析模式</li>
                    <li>使用Enter发送，Shift+Enter换行</li>
                </ul>

                <h4>分析模式：</h4>
                <ul>
                    <li><strong>智能规划：</strong>自动创建分析计划</li>
                    <li><strong>直接执行：</strong>立即处理请求</li>
                </ul>
            </div>
        `;

        window.eventBus.emit('notification:show', {
            message: helpContent,
            type: 'info',
            duration: 0, // 不自动关闭
            allowHtml: true
        });
    }

    /**
     * 更新当前聊天历史
     */
    updateCurrentChatHistory(messageData) {
        if (!this.currentChatId) {
            this.currentChatId = this.generateChatId();
        }

        // 获取当前聊天记录
        let currentChat = this.chatHistory.find(chat => chat.id === this.currentChatId);
        if (!currentChat) {
            currentChat = {
                id: this.currentChatId,
                title: this.generateChatTitle(messageData.content),
                timestamp: new Date(),
                messages: []
            };
            this.chatHistory.unshift(currentChat);
        }

        // 添加消息到历史记录
        currentChat.messages.push({
            type: messageData.type || 'user',
            content: messageData.content,
            timestamp: messageData.timestamp || new Date()
        });

        // 更新标题（只有第一条用户消息时）
        if (currentChat.messages.length === 1 && messageData.type !== 'assistant') {
            currentChat.title = this.generateChatTitle(messageData.content);
        }

        // 保存到本地存储
        this.saveChatHistory();
        this.renderHistory();
    }

    /**
     * 生成聊天标题
     */
    generateChatTitle(content) {
        // 取前30个字符作为标题
        const title = content.trim().substring(0, 30);
        return title.length < content.trim().length ? title + '...' : title;
    }

    /**
     * 渲染历史记录
     */
    renderHistory() {
        this.todayHistory.innerHTML = '';

        const today = new Date().toDateString();
        const todayChats = this.chatHistory.filter(chat =>
            new Date(chat.timestamp).toDateString() === today
        );

        if (todayChats.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'history-empty';
            emptyMessage.textContent = '暂无对话记录';
            emptyMessage.style.cssText = 'color: rgba(255,255,255,0.5); text-align: center; padding: 20px; font-size: 14px;';
            this.todayHistory.appendChild(emptyMessage);
            return;
        }

        todayChats.forEach(chat => {
            const historyItem = this.createHistoryItem(chat);
            this.todayHistory.appendChild(historyItem);
        });
    }

    /**
     * 创建历史记录项
     */
    createHistoryItem(chat) {
        const item = document.createElement('div');
        item.className = 'history-item';
        if (chat.id === this.currentChatId) {
            item.classList.add('active');
        }

        item.textContent = chat.title;
        item.title = chat.title; // 鼠标悬停显示完整标题

        item.addEventListener('click', () => {
            this.loadChat(chat.id);
        });

        return item;
    }

    /**
     * 加载聊天记录
     */
    loadChat(chatId) {
        const chat = this.chatHistory.find(c => c.id === chatId);
        if (!chat) return;

        this.currentChatId = chatId;

        // 清空当前聊天并加载历史消息
        window.eventBus.emit('chat:load', {
            messages: chat.messages
        });

        // 更新活跃状态
        this.renderHistory();

        // 关闭侧边栏（移动端）
        if (window.innerWidth <= 768) {
            this.closeSidebar();
        }
    }

    /**
     * 生成聊天ID
     */
    generateChatId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 加载聊天历史
     */
    loadChatHistory() {
        try {
            const history = localStorage.getItem('chatHistory');
            return history ? JSON.parse(history) : [];
        } catch (error) {
            console.error('加载聊天历史失败:', error);
            return [];
        }
    }

    /**
     * 保存聊天历史
     */
    saveChatHistory() {
        try {
            // 只保留最近50条聊天记录
            const recentHistory = this.chatHistory.slice(0, 50);
            localStorage.setItem('chatHistory', JSON.stringify(recentHistory));
        } catch (error) {
            console.error('保存聊天历史失败:', error);
        }
    }

    /**
     * 处理窗口大小变化
     */
    handleResize() {
        if (window.innerWidth > 768) {
            this.sidebar.classList.remove('open');
        }
    }

    /**
     * 删除聊天记录
     */
    deleteChat(chatId) {
        this.chatHistory = this.chatHistory.filter(chat => chat.id !== chatId);
        this.saveChatHistory();
        this.renderHistory();

        // 如果删除的是当前聊天，开始新聊天
        if (chatId === this.currentChatId) {
            this.startNewChat();
        }
    }

    /**
     * 清空所有历史记录
     */
    clearAllHistory() {
        this.chatHistory = [];
        this.saveChatHistory();
        this.renderHistory();
        this.startNewChat();
    }

    /**
     * 获取选择的分析模式（兼容性方法）
     */
    getSelectedMode() {
        const selectedRadio = document.querySelector('input[name="flow_type"]:checked');
        return selectedRadio?.value || 'planning';
    }
}
