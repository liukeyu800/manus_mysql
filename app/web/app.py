import asyncio
import json
import logging
import os
import re
import sys
import uuid
from io import StringIO
from pathlib import Path
from typing import Dict, Optional

from fastapi import (
    BackgroundTasks,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# 导入Loguru
from loguru import logger as loguru_logger
from pydantic import BaseModel

# 导入OpenManus引擎
from app.agent.manus import SimpleManus
from app.flow.flow_factory import FlowFactory, FlowType

app = FastAPI(title="智能分析平台Web - 数据库分析界面", version="1.0.0")

# 获取当前文件所在目录
current_dir = Path(__file__).parent

# 设置静态文件目录
try:
    app.mount("/static", StaticFiles(directory=current_dir / "static"), name="static")
except RuntimeError:
    pass  # 目录不存在时忽略

# 设置模板目录
try:
    templates = Jinja2Templates(directory=current_dir / "templates")
except:
    templates = None


class ChatRequest(BaseModel):
    prompt: str
    flow_type: str = "planning"


# 会话存储 - 改为线程安全
sessions: Dict[str, dict] = {}
sessions_lock = asyncio.Lock()


# WebSocket连接管理
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        print(f"✅ WebSocket连接已建立: {session_id}")

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            print(f"🔌 WebSocket连接已断开: {session_id}")

    async def send_personal_message(self, message: dict, session_id: str):
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(message)
            except Exception as e:
                print(f"❌ 发送消息失败: {e}")
                self.disconnect(session_id)


manager = ConnectionManager()

# 创建工作区根目录
WORKSPACE_ROOT = Path(__file__).parent.parent.parent / "workspace"
WORKSPACE_ROOT.mkdir(exist_ok=True)


def create_workspace(session_id: str) -> Path:
    """为会话创建工作区目录"""
    job_id = f"job_{session_id[:8]}"
    workspace_dir = WORKSPACE_ROOT / job_id
    workspace_dir.mkdir(exist_ok=True)
    return workspace_dir


# 全局变量来存储当前会话ID
current_session_id = None


def loguru_sink(message):
    """Loguru sink函数，用于捕获智能分析平台的日志"""
    global current_session_id

    if not current_session_id or current_session_id not in sessions:
        return

    try:
        # 提取日志消息文本
        log_text = str(message)

        # 检查是否包含工具调用相关的信息
        if any(
            keyword in log_text
            for keyword in [
                "✨",
                "🛠️",
                "🧰",
                "🔧",
                "🎯",
                "AI",
                "tool",
                "Tool",
                "mysql_list_tables",
                "mysql_describe_table",
                "mysql_query",
            ]
        ):
            formatted_message = format_loguru_message(log_text)
            sessions[current_session_id]["log"].append(formatted_message)

            # 通过WebSocket发送实时消息
            asyncio.create_task(
                manager.send_personal_message(
                    {
                        "type": "tool_call_log",
                        "message": formatted_message,
                        "timestamp": asyncio.get_event_loop().time(),
                    },
                    current_session_id,
                )
            )

            # 限制日志数量
            if len(sessions[current_session_id]["log"]) > 100:
                sessions[current_session_id]["log"] = sessions[current_session_id][
                    "log"
                ][-50:]
    except Exception as e:
        print(f"Loguru sink error: {e}")


def format_loguru_message(log_text: str) -> str:
    """格式化Loguru日志消息"""

    # 提取实际的日志内容（去掉时间戳等前缀）
    # Loguru的日志格式通常是: 时间戳 | 级别 | 模块 - 消息
    if " - " in log_text:
        message = log_text.split(" - ", 1)[-1].strip()
    elif " | " in log_text:
        parts = log_text.split(" | ")
        if len(parts) >= 3:
            message = parts[-1].strip()
        else:
            message = log_text
    else:
        message = log_text

    # 工具思考过程
    if "✨" in message and "thoughts:" in message:
        update_session_progress(10, "AI 正在思考分析策略...")
        return "🤔 AI 正在思考下一步操作..."

    # 工具选择
    if "🛠️" in message and "selected" in message and "tools to use" in message:
        if "1 tools" in message:
            update_session_progress(20, "选择工具中...")
            return "🔧 AI 选择了 1 个工具进行操作"
        elif "0 tools" in message:
            update_session_progress(15, "分析当前状态...")
            return "💭 AI 正在分析当前状态，无需使用工具"
        else:
            match = re.search(r"(\d+) tools", message)
            if match:
                count = match.group(1)
                update_session_progress(20, f"选择了 {count} 个工具...")
                return f"🔧 AI 选择了 {count} 个工具进行操作"

    # 工具准备
    if "🧰" in message and "Tools being prepared:" in message:
        match = re.search(r"\['([^']+)'\]", message)
        if match:
            tool_name = match.group(1)
            tool_display_name = get_tool_display_name(tool_name)
            update_session_progress(30, f"准备 {tool_display_name}...")
            return f"🧰 准备工具: {tool_display_name}"

    # 工具激活
    if "🔧" in message and "Activating tool:" in message:
        match = re.search(r"'([^']+)'", message)
        if match:
            tool_name = match.group(1)
            tool_display_name = get_tool_display_name(tool_name)
            update_session_progress(50, f"执行 {tool_display_name}...")
            return f"⚡ 正在执行: {tool_display_name}"

    # 工具完成
    if "🎯" in message and "completed its mission!" in message:
        match = re.search(r"Tool '([^']+)' completed", message)
        if match:
            tool_name = match.group(1)
            tool_display_name = get_tool_display_name(tool_name)

            # 根据工具类型更新不同的进度
            if "mysql_list_tables" in tool_name:
                update_session_progress(40, "表列表获取完成")
                if "19 个表" in message:
                    return f"✅ {tool_display_name} 完成 - 发现 19 个数据表"
                else:
                    return f"✅ {tool_display_name} 完成 - 发现数据表"
            elif "mysql_describe_table" in tool_name:
                update_session_progress(70, "表结构分析完成")
                # 提取表名
                table_match = re.search(r"表 '([^']+)'", message)
                if table_match:
                    table_name = table_match.group(1)
                    return (
                        f"✅ {tool_display_name} 完成 - 已分析表 '{table_name}' 的结构"
                    )
                else:
                    return f"✅ {tool_display_name} 完成 - 表结构分析完成"
            elif "str_replace_editor" in tool_name:
                update_session_progress(90, "文档生成完成")
                return f"✅ {tool_display_name} 完成 - 文档已生成"
            else:
                update_session_progress(60, "工具执行完成")
                return f"✅ {tool_display_name} 执行完成"

    # 步骤执行
    if "Executing step" in message:
        match = re.search(r"step (\d+)/(\d+)", message)
        if match:
            current = int(match.group(1))
            total = int(match.group(2))
            progress = min(95, int((current / total) * 80) + 10)  # 10-90% 范围
            update_session_progress(progress, f"执行步骤 {current}/{total}")
            return f"📋 执行步骤 {current}/{total}"

    # 返回格式化后的消息
    return message


def get_tool_display_name(tool_name: str) -> str:
    """获取工具的显示名称"""
    tool_names = {
        "mysql_list_tables": "MySQL表列表查询",
        "mysql_describe_table": "MySQL表结构分析",
        "mysql_query": "MySQL数据查询",
        "str_replace_editor": "文件编辑器",
        "bash": "命令行执行",
        "python_execute": "Python代码执行",
        "terminate": "任务完成",
    }
    return tool_names.get(tool_name, tool_name)


def update_session_progress(progress: int, step_info: str):
    """更新会话进度"""
    try:
        if current_session_id and current_session_id in sessions:
            sessions[current_session_id]["progress"] = min(100, max(0, progress))
            sessions[current_session_id]["step_info"] = step_info
            sessions[current_session_id][
                "last_update"
            ] = asyncio.get_event_loop().time()

            # 通过WebSocket发送进度更新
            asyncio.create_task(
                manager.send_personal_message(
                    {
                        "type": "progress_update",
                        "progress": progress,
                        "step_info": step_info,
                        "timestamp": asyncio.get_event_loop().time(),
                    },
                    current_session_id,
                )
            )
    except:
        pass


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "message": "智能分析平台Web服务正常运行"}


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """主页"""
    if templates:
        return templates.TemplateResponse("index.html", {"request": request})
    else:
        return HTMLResponse(
            """
        <html>
            <head><title>智能分析平台Web</title></head>
<body>
<h1>智能分析平台Web界面</h1>
                <p>数据库分析专用界面</p>
                <p>模板文件缺失，请检查安装。</p>
            </body>
        </html>
        """
        )


@app.post("/api/chat")
async def create_chat_session(request: ChatRequest, background_tasks: BackgroundTasks):
    """创建分析会话"""
    session_id = str(uuid.uuid4())
    workspace_dir = create_workspace(session_id)

    async with sessions_lock:
        current_time = asyncio.get_event_loop().time()
        sessions[session_id] = {
            "session_id": session_id,
            "prompt": request.prompt,
            "flow_type": request.flow_type,
            "workspace": str(workspace_dir.relative_to(WORKSPACE_ROOT)),
            "status": "created",
            "result": None,
            "error": None,
            "log": [f"会话创建时间: {str(os.path.basename(workspace_dir))}"],
            "progress": 0,
            "step_info": "",
            "last_update": current_time,
            "created_at": current_time,
        }

    # 添加后台任务来真正执行智能分析平台分析
    background_tasks.add_task(
        process_prompt, request.prompt, session_id, request.flow_type
    )

    return {
        "session_id": session_id,
        "workspace": sessions[session_id]["workspace"],
        "status": "created",
    }


async def process_prompt(prompt: str, session_id: str, flow_type: str = "planning"):
    """处理用户提示词，执行智能分析平台分析"""
    global current_session_id

    try:
        # 设置 Web 环境标志
        sys._called_from_web = True

        # 设置当前会话ID（用于Loguru sink）
        current_session_id = session_id

        # 添加Loguru sink来捕获智能分析平台的日志
        sink_id = loguru_logger.add(loguru_sink, level="DEBUG")

        # 更新会话状态
        sessions[session_id]["status"] = "processing"
        sessions[session_id]["log"].append("🚀 开始执行智能分析平台分析流程...")
        update_session_progress(5, "初始化智能分析平台引擎...")

        # 创建工作区
        workspace_dir = create_workspace(session_id)
        sessions[session_id]["log"].append(f"📁 工作区已创建: {workspace_dir}")

        # 初始化AI引擎
        update_session_progress(10, "正在初始化AI代理...")
        manus = SimpleManus()

        # 创建Flow工厂
        update_session_progress(15, "创建分析流程...")
        try:
            flow_type_enum = (
                FlowType.PLANNING if flow_type == "planning" else FlowType.PLANNING
            )
            flow = FlowFactory.create_flow(flow_type=flow_type_enum, agents=manus)
            sessions[session_id]["log"].append(f"✅ 分析流程已创建: {flow_type}")
        except Exception as e:
            sessions[session_id]["log"].append(f"❌ 流程创建失败: {str(e)}")
            raise

        # 执行分析
        update_session_progress(20, "开始执行数据库分析...")
        sessions[session_id]["log"].append("🔄 正在执行分析任务...")

        try:
            # Add timeout for the entire flow execution
            async with asyncio.timeout(300.0):  # 5 minute timeout
                result = await flow.execute(prompt)
        except asyncio.TimeoutError:
            raise Exception("分析任务超时(5分钟)，请尝试简化分析需求")
        except asyncio.CancelledError:
            # Handle cancellation gracefully
            sessions[session_id]["log"].append("⚠️ 任务被取消")
            raise Exception("分析任务被取消")

        # 完成
        sessions[session_id]["status"] = "completed"
        sessions[session_id]["result"] = str(result)
        sessions[session_id]["log"].append("🎉 智能分析平台分析任务完成!")
        update_session_progress(100, "分析完成!")

        # 发送完成消息
        await manager.send_personal_message(
            {
                "type": "task_completed",
                "result": str(result),
                "timestamp": asyncio.get_event_loop().time(),
            },
            session_id,
        )

        # 移除Loguru sink
        loguru_logger.remove(sink_id)
        current_session_id = None

        # 清理 Web 环境标志
        if hasattr(sys, "_called_from_web"):
            delattr(sys, "_called_from_web")

    except asyncio.CancelledError:
        # Handle asyncio cancellation specifically
        logger.warning(f"Task cancelled for session {session_id}")
        sessions[session_id]["status"] = "cancelled"
        sessions[session_id]["error"] = "任务被取消"
        sessions[session_id]["log"].append("⚠️ 任务被取消")

        # 发送取消消息
        await manager.send_personal_message(
            {
                "type": "task_cancelled",
                "error": "任务被取消",
                "timestamp": asyncio.get_event_loop().time(),
            },
            session_id,
        )

        # 清理资源
        await _cleanup_session_resources(session_id, locals())

    except Exception as e:
        # 错误处理
        loguru_logger.error(f"Task failed for session {session_id}: {e}")
        sessions[session_id]["status"] = "failed"
        sessions[session_id]["error"] = str(e)
        sessions[session_id]["log"].append(f"❌ 执行失败: {str(e)}")

        # 发送错误消息
        await manager.send_personal_message(
            {
                "type": "task_failed",
                "error": str(e),
                "timestamp": asyncio.get_event_loop().time(),
            },
            session_id,
        )

        # 清理资源
        await _cleanup_session_resources(session_id, locals())


async def _cleanup_session_resources(session_id: str, local_vars: dict):
    """Clean up session resources safely"""
    try:
        # 清理 Loguru sink
        if "sink_id" in local_vars:
            loguru_logger.remove(local_vars["sink_id"])

        # 清理 MCP 连接
        if "manus" in local_vars:
            try:
                async with asyncio.timeout(5.0):  # 5 second timeout
                    await local_vars["manus"].cleanup()
            except (asyncio.TimeoutError, asyncio.CancelledError, Exception) as e:
                logger.warning(
                    f"Error during manus cleanup for session {session_id}: {e}"
                )

    except Exception as e:
        logger.error(f"Error during session cleanup for {session_id}: {e}")
    finally:
        # Always clear these regardless of errors
        global current_session_id
        current_session_id = None

        # 清理 Web 环境标志
        if hasattr(sys, "_called_from_web"):
            delattr(sys, "_called_from_web")


@app.get("/api/chat/{session_id}")
async def get_chat_session(session_id: str):
    """获取会话状态"""
    async with sessions_lock:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="会话不存在")

        session_data = sessions[session_id]

        # 增强状态信息，帮助前端智能轮询
        enhanced_status = dict(session_data)

        # 添加轮询建议
        status = session_data.get("status", "unknown")
        step_info = session_data.get("step_info", "")

        # 检测是否可能在长时间LLM推理中
        is_llm_processing = status == "processing" and (
            "思考" in step_info
            or "分析" in step_info
            or "AI 正在" in step_info
            or len(session_data.get("log", [])) > 10  # 长上下文暗示
        )

        enhanced_status["polling_hint"] = {
            "suggested_interval": 30000 if is_llm_processing else 5000,  # 毫秒
            "is_llm_processing": is_llm_processing,
            "context_length": len(session_data.get("log", [])),
            "last_activity": session_data.get("last_update", 0),
        }

        return enhanced_status


@app.get("/api/debug/chat/{session_id}")
async def debug_chat_session(session_id: str):
    """调试：获取会话详细信息"""
    async with sessions_lock:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="会话不存在")

        session_data = sessions[session_id]
        return {
            "session_id": session_id,
            "status": session_data.get("status"),
            "log_count": len(session_data.get("log", [])),
            "logs": session_data.get("log", []),
            "progress": session_data.get("progress", 0),
            "step_info": session_data.get("step_info", ""),
            "error": session_data.get("error"),
            "result": session_data.get("result"),
        }


@app.post("/api/chat/{session_id}/cancel")
async def cancel_chat_session(session_id: str):
    """取消会话"""
    async with sessions_lock:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="会话不存在")

        sessions[session_id]["status"] = "cancelled"

    return {"status": "cancelled"}


@app.get("/api/sessions")
async def list_sessions():
    """获取历史会话列表"""
    async with sessions_lock:
        return list(sessions.values())


# 导入额外的模型
class UserConfirmationRequest(BaseModel):
    response: str


@app.post("/api/chat/{session_id}/confirm")
async def confirm_user_response(session_id: str, request: UserConfirmationRequest):
    """处理用户确认响应"""
    async with sessions_lock:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="会话不存在")

        session_data = sessions[session_id]

        # 检查是否在等待用户输入
        if session_data.get("status") != "waiting_user_input":
            raise HTTPException(status_code=400, detail="当前不在等待用户输入状态")

        # 保存用户响应
        session_data["user_response"] = request.response
        session_data["status"] = "processing"  # 恢复处理状态
        session_data["log"].append(f"👤 用户确认: {request.response}")

        # 清除待回答的问题
        session_data.pop("pending_question", None)

    return {"status": "confirmed", "response": request.response}


@app.get("/api/chat/{session_id}/pending-question")
async def get_pending_question(session_id: str):
    """获取待用户确认的问题"""
    async with sessions_lock:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="会话不存在")

        session_data = sessions[session_id]

        if session_data.get("status") == "waiting_user_input":
            return {
                "has_question": True,
                "question": session_data.get("pending_question", ""),
                "status": "waiting_user_input",
            }
        else:
            return {
                "has_question": False,
                "status": session_data.get("status", "unknown"),
            }


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket端点，用于实时通信"""
    # 检查会话是否存在
    async with sessions_lock:
        if session_id not in sessions:
            await websocket.close(code=4004, reason="Session not found")
            return

    # 建立连接
    await manager.connect(websocket, session_id)

    try:
        # 发送欢迎消息
        await manager.send_personal_message(
            {
                "type": "connection_established",
                "message": "WebSocket连接已建立",
                "timestamp": asyncio.get_event_loop().time(),
            },
            session_id,
        )

        # 保持连接活跃
        while True:
            try:
                # 接收客户端消息（心跳等）
                data = await websocket.receive_json()

                if data.get("type") == "ping":
                    await manager.send_personal_message(
                        {"type": "pong", "timestamp": asyncio.get_event_loop().time()},
                        session_id,
                    )

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket处理消息失败: {e}")
                break

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(session_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
