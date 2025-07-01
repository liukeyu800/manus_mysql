import asyncio
import sys

from app.tool.base import BaseTool


class AskHuman(BaseTool):
    """Add a tool to ask human for help."""

    name: str = "ask_human"
    description: str = "Use this tool to ask human for help."
    parameters: str = {
        "type": "object",
        "properties": {
            "inquire": {
                "type": "string",
                "description": "The question you want to ask human.",
            }
        },
        "required": ["inquire"],
    }

    async def execute(self, inquire: str) -> str:
        # 检查是否在 Web 环境中运行
        if hasattr(sys, "_called_from_web"):
            # Web 环境：通过会话系统处理用户交互
            return await self._handle_web_interaction(inquire)
        else:
            # 命令行环境：使用传统的 input()
            return input(f"""Bot: {inquire}\n\nYou: """).strip()

    async def _handle_web_interaction(self, inquire: str) -> str:
        """在 Web 环境中处理用户交互"""
        # 导入全局会话变量
        try:
            from app.web.app import current_session_id, sessions

            if current_session_id and current_session_id in sessions:
                # 向会话添加用户询问
                sessions[current_session_id]["log"].append(
                    f"🤔 需要您的确认: {inquire}"
                )
                sessions[current_session_id]["status"] = "waiting_user_input"
                sessions[current_session_id]["pending_question"] = inquire
                sessions[current_session_id]["step_info"] = "等待用户确认..."

                # 等待用户响应
                max_wait_time = 300  # 最大等待5分钟
                wait_interval = 1  # 每秒检查一次
                waited_time = 0

                while waited_time < max_wait_time:
                    try:
                        await asyncio.sleep(wait_interval)
                        waited_time += wait_interval

                        # 检查用户是否已经响应
                        if sessions[current_session_id].get("status") == "processing":
                            user_response = sessions[current_session_id].get(
                                "user_response", ""
                            )
                            if user_response:
                                # 清理用户响应字段
                                sessions[current_session_id].pop("user_response", None)
                                return user_response

                        # 检查会话是否被取消
                        if sessions[current_session_id].get("status") == "cancelled":
                            return "用户已取消操作"
                    except asyncio.CancelledError:
                        # 处理任务取消，返回默认响应而不是传播异常
                        sessions[current_session_id]["status"] = "processing"
                        sessions[current_session_id]["log"].append(
                            "⚠️ 任务被取消，使用默认操作继续"
                        )
                        return "任务被取消，继续默认操作"

                # 超时处理
                sessions[current_session_id]["status"] = "processing"
                sessions[current_session_id]["log"].append(
                    "⏰ 用户确认超时，使用默认操作"
                )
                return "确认超时，继续默认操作"
            else:
                return "无法获取用户输入，继续默认操作"
        except ImportError:
            # 如果不在 Web 环境中，使用命令行输入
            return input(f"""Bot: {inquire}\n\nYou: """).strip()
