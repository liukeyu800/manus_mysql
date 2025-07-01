/**
 * 通知组件 - 处理各种类型的通知显示
 */
class NotificationComponent {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.notifications = [];
        this.container = null;

        this.init();
    }

    init() {
        this.createContainer();
        this.bindEvents();
    }

    bindEvents() {
        this.eventBus.on('notification:show', (data) => {
            this.show(data.message, data.type);
        });
    }

    createContainer() {
        // 检查是否已存在通知容器
        this.container = document.getElementById('notificationContainer');

        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notificationContainer';
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        }
    }

    show(message, type = 'info', duration = 5000) {
        const notification = this.createNotification(message, type);

        // 添加到容器
        this.container.appendChild(notification);
        this.notifications.push(notification);

        // 触发进入动画
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // 自动移除
        if (duration > 0) {
            setTimeout(() => {
                this.remove(notification);
            }, duration);
        }

        // 限制通知数量
        this.limitNotifications();
    }

    createNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        const icon = this.getTypeIcon(type);

        notification.innerHTML = `
            <div class="notification-content">
                <i class="${icon}"></i>
                <span class="notification-message">${this.escapeHtml(message)}</span>
                <button class="notification-close" onclick="this.closest('.notification').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // 绑定关闭事件
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.remove(notification);
        });

        // 点击通知本身也可以关闭
        notification.addEventListener('click', (e) => {
            if (e.target === notification || e.target.className === 'notification-content') {
                this.remove(notification);
            }
        });

        return notification;
    }

    remove(notification) {
        if (!notification || !notification.parentNode) return;

        // 移除动画
        notification.classList.add('removing');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }

            // 从数组中移除
            const index = this.notifications.indexOf(notification);
            if (index > -1) {
                this.notifications.splice(index, 1);
            }
        }, 300);
    }

    limitNotifications(maxCount = 5) {
        while (this.notifications.length > maxCount) {
            const oldest = this.notifications[0];
            this.remove(oldest);
        }
    }

    getTypeIcon(type) {
        const icons = {
            'info': 'fas fa-info-circle',
            'success': 'fas fa-check-circle',
            'warning': 'fas fa-exclamation-triangle',
            'error': 'fas fa-times-circle'
        };
        return icons[type] || icons['info'];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 便捷方法
    success(message, duration) {
        this.show(message, 'success', duration);
    }

    error(message, duration) {
        this.show(message, 'error', duration);
    }

    warning(message, duration) {
        this.show(message, 'warning', duration);
    }

    info(message, duration) {
        this.show(message, 'info', duration);
    }

    clear() {
        this.notifications.forEach(notification => {
            this.remove(notification);
        });
    }

    reset() {
        this.clear();
    }
}
