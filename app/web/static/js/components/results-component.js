/**
 * 结果显示组件 - 处理分析结果展示
 */
class ResultsComponent {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.elements = {
            resultsSection: document.getElementById('resultsSection'),
            resultDisplay: document.getElementById('resultDisplay'),
            progressContainer: document.getElementById('progressContainer'),
            progressBar: document.getElementById('progressBar'),
            progressText: document.getElementById('progressText'),
            stepInfo: document.getElementById('stepInfo')
        };

        this.currentProgress = 0;
        this.drawers = new Map();
        this.init();
    }

    init() {
        this.validateElements();
    }

    validateElements() {
        const requiredElements = ['resultsSection', 'resultDisplay'];
        requiredElements.forEach(key => {
            if (!this.elements[key]) {
                console.warn(`❌ 未找到必需元素: ${key}`);
            }
        });
    }

    show() {
        if (this.elements.resultsSection) {
            this.elements.resultsSection.style.display = 'block';
            this.showLoadingState();
        }
    }

    hide() {
        if (this.elements.resultsSection) {
            this.elements.resultsSection.style.display = 'none';
        }
    }

    showLoadingState() {
        if (this.elements.resultDisplay) {
            this.elements.resultDisplay.innerHTML = `
                <div class="loading-placeholder">
                    <i class="fas fa-cog fa-spin"></i>
                    <p>正在进行数据库分析...</p>
                </div>
            `;
        }
    }

    updateProgress(progressData) {
        const { current, total, step, message } = progressData;

        if (total > 0) {
            this.currentProgress = Math.round((current / total) * 100);

            if (this.elements.progressBar) {
                this.elements.progressBar.style.width = `${this.currentProgress}%`;
            }

            if (this.elements.progressText) {
                this.elements.progressText.textContent = `${this.currentProgress}%`;
            }

            if (this.elements.progressContainer) {
                this.elements.progressContainer.style.display = 'block';
            }
        }

        if (this.elements.stepInfo && message) {
            this.elements.stepInfo.textContent = message;
        }
    }

    addToolCall(toolData) {
        const { tool_name, message, timestamp, status } = toolData;

        // 检查是否需要创建新的抽屉
        const drawer = this.getCurrentOrCreateDrawer(tool_name, message, timestamp);

        // 添加详细信息到抽屉
        this.addDetailToDrawer(drawer, message, timestamp);

        // 更新抽屉状态
        this.updateDrawerStatus(drawer, status);
    }

    getCurrentOrCreateDrawer(toolName, message, timestamp) {
        const isNewAnalysisRound = this.isNewAnalysisRound(message);

        if (isNewAnalysisRound || !this.drawers.has(toolName)) {
            const drawer = this.createNewDrawer(toolName, message, timestamp);
            this.drawers.set(toolName, drawer);
            return drawer;
        }

        return this.drawers.get(toolName);
    }

    createNewDrawer(toolName, message, timestamp) {
        const drawerId = `drawer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const toolDisplayName = this.getToolDisplayName(toolName);
        const timeString = new Date(timestamp * 1000).toLocaleTimeString();

        const drawerHtml = `
            <div class="drawer-item" id="${drawerId}">
                <div class="drawer-header" onclick="window.app.ui.components.get('results').handleDrawerClick(event)">
                    <div>
                        <i class="fas fa-${this.getToolIcon(toolName)}"></i>
                        <span class="drawer-title">${toolDisplayName}</span>
                        <span class="drawer-time">${timeString}</span>
                    </div>
                    <div>
                        <span class="drawer-status" id="${drawerId}-status">
                            <i class="fas fa-spinner fa-spin"></i> 执行中
                        </span>
                        <i class="fas fa-chevron-down drawer-chevron"></i>
                    </div>
                </div>
                <div class="drawer-content">
                    <div class="drawer-log-container">
                        <!-- 详细日志将在这里添加 -->
                    </div>
                </div>
            </div>
        `;

        if (this.elements.resultDisplay) {
            // 移除加载状态
            const loadingPlaceholder = this.elements.resultDisplay.querySelector('.loading-placeholder');
            if (loadingPlaceholder) {
                loadingPlaceholder.remove();
            }

            this.elements.resultDisplay.insertAdjacentHTML('beforeend', drawerHtml);
        }

        return document.getElementById(drawerId);
    }

    addDetailToDrawer(drawer, message, timestamp) {
        const logContainer = drawer.querySelector('.drawer-log-container');
        if (!logContainer) return;

        const timeString = new Date(timestamp * 1000).toLocaleTimeString();
        const content = this.processMessageContent(message);

        const detailHtml = `
            <div class="drawer-detail-item">
                <div class="detail-time">${timeString}</div>
                <div class="detail-content">${content}</div>
            </div>
        `;

        logContainer.insertAdjacentHTML('beforeend', detailHtml);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    updateDrawerStatus(drawer, status) {
        const statusElement = drawer.querySelector('.drawer-status');
        if (!statusElement) return;

        switch (status) {
            case 'running':
                statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 执行中';
                statusElement.className = 'drawer-status status-running';
                break;
            case 'completed':
                statusElement.innerHTML = '<i class="fas fa-check"></i> 完成';
                statusElement.className = 'drawer-status status-completed';
                break;
            case 'error':
                statusElement.innerHTML = '<i class="fas fa-times"></i> 错误';
                statusElement.className = 'drawer-status status-error';
                break;
        }
    }

    showResult(resultData) {
        const { content, timestamp } = resultData;
        this.addFinalResult(content, timestamp);
    }

    addFinalResult(content, timestamp) {
        const timeString = new Date(timestamp * 1000).toLocaleTimeString();
        const processedContent = this.processMessageContent(content);

        const resultHtml = `
            <div class="chat-message final-result">
                <div class="message-header">
                    <i class="fas fa-chart-line"></i>
                    <span>分析结果</span>
                    <span class="message-time">${timeString}</span>
                </div>
                <div class="message-content">${processedContent}</div>
            </div>
        `;

        if (this.elements.resultDisplay) {
            this.elements.resultDisplay.insertAdjacentHTML('beforeend', resultHtml);
            this.elements.resultDisplay.scrollTop = this.elements.resultDisplay.scrollHeight;
        }
    }

    showError(error) {
        const errorHtml = `
            <div class="chat-message error-result">
                <div class="message-header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>错误信息</span>
                </div>
                <div class="message-content">${this.escapeHtml(error)}</div>
            </div>
        `;

        if (this.elements.resultDisplay) {
            this.elements.resultDisplay.insertAdjacentHTML('beforeend', errorHtml);
            this.elements.resultDisplay.scrollTop = this.elements.resultDisplay.scrollHeight;
        }
    }

    handleDrawerClick(event) {
        const header = event.currentTarget;
        const drawer = header.closest('.drawer-item');
        const content = drawer.querySelector('.drawer-content');
        const chevron = header.querySelector('.drawer-chevron');

        if (content && chevron) {
            const isExpanded = drawer.classList.contains('expanded');

            if (isExpanded) {
                drawer.classList.remove('expanded');
                content.style.maxHeight = '0';
            } else {
                drawer.classList.add('expanded');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        }
    }

    // 辅助方法
    isNewAnalysisRound(message) {
        return message.includes('🚀 开始分析') ||
            message.includes('开始执行') ||
            message.includes('新的分析');
    }

    getToolDisplayName(toolName) {
        const toolNames = {
            'mysql_database': 'MySQL数据库查询',
            'python_execute': 'Python代码执行',
            'data_visualization': '数据可视化',
            'file_operators': '文件操作',
            'str_replace_editor': '文本编辑',
            'ask_human': '用户交互'
        };
        return toolNames[toolName] || toolName;
    }

    getToolIcon(toolName) {
        const toolIcons = {
            'mysql_database': 'database',
            'python_execute': 'code',
            'data_visualization': 'chart-pie',
            'file_operators': 'file',
            'str_replace_editor': 'edit',
            'ask_human': 'user'
        };
        return toolIcons[toolName] || 'cog';
    }

    processMessageContent(message) {
        if (!message) return '';

        // 转义HTML
        let content = this.escapeHtml(message);

        // 处理代码块
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g,
            '<pre class="code-block"><code>$2</code></pre>');

        // 处理内联代码
        content = content.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // 处理链接
        content = content.replace(/(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>');

        // 处理换行
        content = content.replace(/\n/g, '<br>');

        return content;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    reset() {
        this.currentProgress = 0;
        this.drawers.clear();

        if (this.elements.resultDisplay) {
            this.elements.resultDisplay.innerHTML = '';
        }

        if (this.elements.progressContainer) {
            this.elements.progressContainer.style.display = 'none';
        }

        this.hide();
    }
}
