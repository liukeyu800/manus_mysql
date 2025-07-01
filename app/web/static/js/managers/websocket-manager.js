/**
 * WebSocket管理器 - 处理实时通信
 */
class WebSocketManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.websocket = null;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.heartbeatInterval = null;
        this.reconnectTimeout = null;
    }

    /**
     * 连接WebSocket
     * @param {string} sessionId 会话ID
     */
    connect(sessionId) {
        if (this.isConnecting || (this.websocket && this.websocket.readyState === WebSocket.OPEN)) {
            console.log('🔌 WebSocket已连接或正在连接中');
            return;
        }

        this.isConnecting = true;
        this.disconnect();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;

        console.log(`🔌 连接WebSocket: ${wsUrl}`);

        try {
            this.websocket = new WebSocket(wsUrl);
            this.bindWebSocketEvents(sessionId);
        } catch (error) {
            console.error('WebSocket连接失败:', error);
            this.isConnecting = false;
            this.eventBus.emit('error', { message: 'WebSocket连接失败' });
        }
    }

    bindWebSocketEvents(sessionId) {
        this.websocket.onopen = () => {
            console.log('✅ WebSocket连接已建立');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.eventBus.emit('websocket:connected');
        };

        this.websocket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('📨 收到WebSocket消息:', message);
                this.eventBus.emit('websocket:message', message);
            } catch (error) {
                console.error('解析WebSocket消息失败:', error);
            }
        };

        this.websocket.onclose = (event) => {
            console.log('🔌 WebSocket连接关闭:', event.code, event.reason);
            this.isConnecting = false;
            this.stopHeartbeat();

            if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect(sessionId);
            } else {
                this.eventBus.emit('websocket:disconnected');
            }
        };

        this.websocket.onerror = (error) => {
            console.error('❌ WebSocket错误:', error);
            this.isConnecting = false;
            this.eventBus.emit('websocket:error', error);
        };
    }

    /**
     * 断开WebSocket连接
     */
    disconnect() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.stopHeartbeat();
        this.clearReconnectTimeout();
    }

    /**
     * 安排重连
     */
    scheduleReconnect(sessionId) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        console.log(`🔄 ${delay}ms后尝试第${this.reconnectAttempts}次重连`);

        this.reconnectTimeout = setTimeout(() => {
            this.connect(sessionId);
        }, delay);
    }

    /**
     * 清除重连超时
     */
    clearReconnectTimeout() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    /**
     * 开始心跳
     */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    /**
     * 停止心跳
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * 发送消息
     * @param {Object} message 消息对象
     */
    send(message) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket未连接，无法发送消息');
        }
    }

    /**
     * 获取连接状态
     */
    getState() {
        if (!this.websocket) return 'disconnected';

        switch (this.websocket.readyState) {
            case WebSocket.CONNECTING: return 'connecting';
            case WebSocket.OPEN: return 'connected';
            case WebSocket.CLOSING: return 'closing';
            case WebSocket.CLOSED: return 'disconnected';
            default: return 'unknown';
        }
    }
}
