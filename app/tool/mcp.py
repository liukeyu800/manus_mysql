import asyncio
from contextlib import AsyncExitStack
from typing import Dict, List, Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client
from mcp.types import ListToolsResult, TextContent

from app.logger import logger
from app.tool.base import BaseTool, ToolResult
from app.tool.tool_collection import ToolCollection


class MCPClientTool(BaseTool):
    """Represents a tool proxy that can be called on the MCP server from the client side."""

    session: Optional[ClientSession] = None
    server_id: str = ""  # Add server identifier
    original_name: str = ""

    async def execute(self, **kwargs) -> ToolResult:
        """Execute the tool by making a remote call to the MCP server."""
        if not self.session:
            return ToolResult(error="Not connected to MCP server")

        try:
            logger.info(f"Executing tool: {self.original_name}")
            result = await self.session.call_tool(self.original_name, kwargs)
            content_str = ", ".join(
                item.text for item in result.content if isinstance(item, TextContent)
            )
            return ToolResult(output=content_str or "No output returned.")
        except Exception as e:
            return ToolResult(error=f"Error executing tool: {str(e)}")


class MCPClients(ToolCollection):
    """
    A collection of tools that connects to multiple MCP servers and manages available tools through the Model Context Protocol.
    """

    sessions: Dict[str, ClientSession] = {}
    exit_stacks: Dict[str, AsyncExitStack] = {}
    description: str = "MCP client tools for server interaction"

    def __init__(self):
        super().__init__()  # Initialize with empty tools list
        self.name = "mcp"  # Keep name for backward compatibility

    async def connect_sse(self, server_url: str, server_id: str = "") -> None:
        """Connect to an MCP server using SSE transport."""
        if not server_url:
            raise ValueError("Server URL is required.")

        server_id = server_id or server_url

        # Always ensure clean disconnection before new connection
        if server_id in self.sessions:
            await self.disconnect(server_id)

        exit_stack = AsyncExitStack()
        self.exit_stacks[server_id] = exit_stack

        streams_context = sse_client(url=server_url)
        streams = await exit_stack.enter_async_context(streams_context)
        session = await exit_stack.enter_async_context(ClientSession(*streams))
        self.sessions[server_id] = session

        await self._initialize_and_list_tools(server_id)

    async def connect_stdio(
        self, command: str, args: List[str], server_id: str = ""
    ) -> None:
        """Connect to an MCP server using stdio transport."""
        if not command:
            raise ValueError("Server command is required.")

        server_id = server_id or command

        # Always ensure clean disconnection before new connection
        if server_id in self.sessions:
            await self.disconnect(server_id)

        exit_stack = AsyncExitStack()
        self.exit_stacks[server_id] = exit_stack

        server_params = StdioServerParameters(command=command, args=args)
        stdio_transport = await exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        read, write = stdio_transport
        session = await exit_stack.enter_async_context(ClientSession(read, write))
        self.sessions[server_id] = session

        await self._initialize_and_list_tools(server_id)

    async def _initialize_and_list_tools(self, server_id: str) -> None:
        """Initialize session and populate tool map."""
        session = self.sessions.get(server_id)
        if not session:
            raise RuntimeError(f"Session not initialized for server {server_id}")

        await session.initialize()
        response = await session.list_tools()

        # Create proper tool objects for each server tool
        for tool in response.tools:
            original_name = tool.name
            # 简化工具名称：如果只有一个服务器，直接使用原始名称
            if len(self.sessions) == 1:
                tool_name = original_name
            else:
                # 多服务器时使用简化的前缀
                tool_name = f"{server_id}_{original_name}"

            tool_name = self._sanitize_tool_name(tool_name)

            server_tool = MCPClientTool(
                name=tool_name,
                description=tool.description,
                parameters=tool.inputSchema,
                session=session,
                server_id=server_id,
                original_name=original_name,
            )
            self.tool_map[tool_name] = server_tool

        # Update tools tuple
        self.tools = tuple(self.tool_map.values())
        logger.info(
            f"Connected to server {server_id} with tools: {[tool.name for tool in response.tools]}"
        )

    def _sanitize_tool_name(self, name: str) -> str:
        """Sanitize tool name to match MCPClientTool requirements."""
        import re

        # 对于标准的工具名称，保持原样
        if re.match(r"^[a-zA-Z][a-zA-Z0-9_]*$", name) and len(name) <= 64:
            return name

        # 仅对特殊字符进行处理
        sanitized = re.sub(r"[^a-zA-Z0-9_]", "_", name)

        # 移除连续的下划线
        sanitized = re.sub(r"_+", "_", sanitized)

        # 移除开头和结尾的下划线
        sanitized = sanitized.strip("_")

        # 确保以字母开头
        if sanitized and not sanitized[0].isalpha():
            sanitized = "tool_" + sanitized

        # 截断到合理长度
        if len(sanitized) > 64:
            sanitized = sanitized[:64].rstrip("_")

        return sanitized or "unnamed_tool"

    async def list_tools(self) -> ListToolsResult:
        """List all available tools."""
        tools_result = ListToolsResult(tools=[])
        for session in self.sessions.values():
            response = await session.list_tools()
            tools_result.tools += response.tools
        return tools_result

    async def disconnect(self, server_id: str = "") -> None:
        """Disconnect from a specific MCP server or all servers if no server_id provided."""
        if server_id:
            if server_id in self.sessions:
                try:
                    exit_stack = self.exit_stacks.get(server_id)

                    # Close the exit stack which will handle session cleanup
                    if exit_stack:
                        try:
                            # Add timeout to prevent hanging
                            async with asyncio.timeout(5.0):  # 5 second timeout
                                await exit_stack.aclose()
                        except asyncio.TimeoutError:
                            logger.warning(
                                f"Timeout while disconnecting from {server_id}, forcing cleanup"
                            )
                        except (RuntimeError, asyncio.CancelledError) as e:
                            if "cancel scope" in str(e).lower() or isinstance(
                                e, asyncio.CancelledError
                            ):
                                logger.warning(
                                    f"Cancel scope/cancelled error during disconnect from {server_id}, continuing with cleanup: {e}"
                                )
                            else:
                                raise
                        except Exception as e:
                            logger.warning(
                                f"Unexpected error during exit stack cleanup for {server_id}: {e}"
                            )

                    # Clean up references
                    self.sessions.pop(server_id, None)
                    self.exit_stacks.pop(server_id, None)

                    # Remove tools associated with this server
                    self.tool_map = {
                        k: v
                        for k, v in self.tool_map.items()
                        if getattr(v, "server_id", None) != server_id
                    }
                    self.tools = tuple(self.tool_map.values())
                    logger.info(f"Disconnected from MCP server {server_id}")
                except Exception as e:
                    logger.error(f"Error disconnecting from server {server_id}: {e}")
                    # Force cleanup even if there was an error
                    self.sessions.pop(server_id, None)
                    self.exit_stacks.pop(server_id, None)
                    self.tool_map = {
                        k: v
                        for k, v in self.tool_map.items()
                        if getattr(v, "server_id", None) != server_id
                    }
                    self.tools = tuple(self.tool_map.values())
        else:
            # Disconnect from all servers in a deterministic order
            server_ids = list(self.sessions.keys())
            for sid in server_ids:
                await self.disconnect(sid)

            # Final cleanup to ensure everything is cleared
            self.sessions.clear()
            self.exit_stacks.clear()
            self.tool_map = {}
            self.tools = tuple()
            logger.info("Disconnected from all MCP servers")
