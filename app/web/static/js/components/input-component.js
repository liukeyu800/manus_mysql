/**
 * ChatGPT风格的输入组件
 * 处理用户消息输入、发送按钮状态、字符计数等
 */
class InputComponent {
    constructor() {
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.exampleCards = document.querySelectorAll('.example-card');

        this.maxLength = 2000;
        this.isAnalyzing = false;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // 消息输入处理
        this.messageInput.addEventListener('input', (e) => {
            this.updateSendButtonState();
            this.autoResize();
        });

        // 键盘事件处理
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Shift + Enter 换行，不做任何处理
                    return;
                } else {
                    // Enter 发送消息
                    e.preventDefault();
                    this.handleSendMessage();
                }
            }
        });

        // 发送按钮点击
        this.sendBtn.addEventListener('click', () => {
            this.handleSendMessage();
        });

        // 示例卡片点击
        this.exampleCards.forEach(card => {
            card.addEventListener('click', () => {
                const example = card.dataset.example;
                this.setMessage(example);
                this.handleSendMessage();
            });
        });

        // 监听分析状态变化
        window.eventBus.on('analysis:started', () => {
            this.setAnalyzing(true);
        });

        window.eventBus.on('analysis:completed', () => {
            this.setAnalyzing(false);
        });

        window.eventBus.on('analysis:error', () => {
            this.setAnalyzing(false);
        });

        // 监听设置输入框内容事件
        window.eventBus.on('input:set', (data) => {
            this.setMessage(data.text);
        });
    }

    /**
     * 处理发送消息
     */
    handleSendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isAnalyzing) {
            return;
        }

        // 触发消息发送事件
        window.eventBus.emit('message:send', {
            content: message,
            timestamp: new Date()
        });

        // 清空输入框
        this.clearMessage();
    }

    /**
     * 设置消息内容
     */
    setMessage(message) {
        this.messageInput.value = message;
        this.updateSendButtonState();
        this.autoResize();
        this.messageInput.focus();
    }

    /**
     * 清空消息
     */
    clearMessage() {
        this.messageInput.value = '';
        this.updateSendButtonState();
        this.autoResize();
    }



    /**
     * 更新发送按钮状态
     */
    updateSendButtonState() {
        const hasContent = this.messageInput.value.trim().length > 0;
        const withinLimit = this.messageInput.value.length <= this.maxLength;

        this.sendBtn.disabled = !hasContent || !withinLimit || this.isAnalyzing;
    }

    /**
     * 自动调整输入框高度
     */
    autoResize() {
        const input = this.messageInput;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }

    /**
     * 设置分析状态
     */
    setAnalyzing(analyzing) {
        this.isAnalyzing = analyzing;
        this.updateSendButtonState();

        if (analyzing) {
            this.messageInput.placeholder = '正在分析中...';
            this.sendBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        } else {
            this.messageInput.placeholder = '输入您的数据分析需求...';
            this.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }

    /**
     * 获取当前消息
     */
    getCurrentMessage() {
        return this.messageInput.value.trim();
    }

    /**
     * 聚焦输入框
     */
    focus() {
        this.messageInput.focus();
    }

    /**
     * 获取选择的分析模式
     */
    getAnalysisMode() {
        const checkedMode = document.querySelector('input[name="flow_type"]:checked');
        return checkedMode ? checkedMode.value : 'planning';
    }
}

// 导出给全局使用
window.InputComponent = InputComponent;
