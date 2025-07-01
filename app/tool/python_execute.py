import multiprocessing
import sys
from io import StringIO
from typing import Dict

from app.tool.base import BaseTool


class PythonExecute(BaseTool):
    """用于执行Python代码的工具，具有超时和安全限制。"""

    name: str = "python_execute"
    description: str = (
        "执行Python代码字符串。注意：只有打印输出可见，函数返回值不会被捕获。使用print语句查看结果。"
    )
    parameters: dict = {
        "type": "object",
        "properties": {
            "code": {
                "type": "string",
                "description": "要执行的Python代码。",
            },
        },
        "required": ["code"],
    }

    def _run_code(self, code: str, result_dict: dict, safe_globals: dict) -> None:
        original_stdout = sys.stdout
        try:
            output_buffer = StringIO()
            sys.stdout = output_buffer
            exec(code, safe_globals, safe_globals)
            result_dict["observation"] = output_buffer.getvalue()
            result_dict["success"] = True
        except Exception as e:
            result_dict["observation"] = str(e)
            result_dict["success"] = False
        finally:
            sys.stdout = original_stdout

    def _check_forbidden_operations(self, code: str) -> str:
        """检查代码中是否包含被禁止的网络操作"""

        forbidden_patterns = [
            "requests.get",
            "requests.post",
            "urllib.request",
            "urllib.urlopen",
            "http.client",
            "httplib",
            "socket.create_connection",
            "BeautifulSoup",
            "scraping",
            "api.nasa.gov",
            "spaceflightnewsapi",
            "lldev.thespacedevs.com",
            "www.nasa.gov",
        ]

        code_lower = code.lower()
        for pattern in forbidden_patterns:
            if pattern.lower() in code_lower:
                return f"❌ 代码包含被禁止的网络操作: {pattern}\n请只使用数据库中的现有数据进行分析。"

        return ""

    async def execute(
        self,
        code: str,
        timeout: int = 5,
    ) -> Dict:
        """
        Executes the provided Python code with a timeout.

        Args:
            code (str): The Python code to execute.
            timeout (int): Execution timeout in seconds.

        Returns:
            Dict: Contains 'output' with execution output or error message and 'success' status.
        """

        # 检查是否包含被禁止的网络操作
        forbidden_check = self._check_forbidden_operations(code)
        if forbidden_check:
            return {
                "observation": forbidden_check,
                "success": False,
            }

        with multiprocessing.Manager() as manager:
            result = manager.dict({"observation": "", "success": False})
            if isinstance(__builtins__, dict):
                safe_globals = {"__builtins__": __builtins__}
            else:
                safe_globals = {"__builtins__": __builtins__.__dict__.copy()}
            proc = multiprocessing.Process(
                target=self._run_code, args=(code, result, safe_globals)
            )
            proc.start()
            proc.join(timeout)

            # timeout process
            if proc.is_alive():
                proc.terminate()
                proc.join(1)
                return {
                    "observation": f"执行超时，超过{timeout}秒",
                    "success": False,
                }
            return dict(result)
