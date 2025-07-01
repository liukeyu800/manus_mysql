"""MySQL database tools for OpenManus framework."""

import csv
import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import pymysql
import pymysql.cursors

from app.config import Config
from app.tool.base import BaseTool, ToolResult


def get_db_config():
    """Get database configuration from config file or environment variables."""
    config_instance = Config()
    mysql_settings = config_instance.mysql

    if mysql_settings:
        # Use configuration from config file
        config = {
            "host": mysql_settings.host,
            "port": mysql_settings.port,
            "user": mysql_settings.user,
            "password": mysql_settings.password,
            "database": mysql_settings.database,
            "charset": mysql_settings.charset,
            "connect_timeout": mysql_settings.connect_timeout,
            "read_timeout": mysql_settings.read_timeout,
            "write_timeout": mysql_settings.write_timeout,
            "cursorclass": pymysql.cursors.DictCursor,
        }

        if not all([config["user"], config["password"], config["database"]]):
            raise ValueError(
                "Missing required database configuration in config file. "
                "Please check that user, password, and database are set in the [mysql] section."
            )

        return config
    else:
        # Fallback to environment variables for backward compatibility
        config = {
            "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
            "port": int(os.getenv("MYSQL_PORT", "3306")),
            "user": os.getenv("MYSQL_USER"),
            "password": os.getenv("MYSQL_PASSWORD"),
            "database": os.getenv("MYSQL_DATABASE"),
            "charset": "utf8mb4",
            "connect_timeout": 30,
            "read_timeout": 30,
            "write_timeout": 30,
            "cursorclass": pymysql.cursors.DictCursor,
        }

        if not all([config["user"], config["password"], config["database"]]):
            raise ValueError(
                "Missing required database configuration. Please either:\n"
                "1. Add [mysql] section to your config.toml file with user, password, and database\n"
                "2. Set environment variables: MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE"
            )

        return config


class MySQLConnection:
    """Context manager for MySQL connections."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.conn = None

    def __enter__(self):
        self.conn = pymysql.connect(**self.config)
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()


class MySQLReadQuery(BaseTool):
    """在MySQL数据库上执行只读查询。"""

    name: str = "mysql_read_query"
    description: str = (
        "在MySQL数据库上执行只读查询并返回结果（仅支持SELECT、SHOW、DESCRIBE、EXPLAIN）"
    )
    parameters: dict = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "要执行的只读SQL查询（仅支持SELECT、SHOW、DESCRIBE、EXPLAIN）",
            },
            "params": {
                "type": "array",
                "description": "查询的可选参数列表",
                "items": {"type": "string"},
                "default": [],
            },
            "fetch_all": {
                "type": "boolean",
                "description": "如果为True，获取所有结果；如果为False，获取一行",
                "default": True,
            },
            "row_limit": {
                "type": "integer",
                "description": "返回的最大行数",
                "default": 1000,
            },
        },
        "required": ["query"],
    }

    async def execute(
        self,
        query: str,
        params: Optional[List[Any]] = None,
        fetch_all: bool = True,
        row_limit: int = 1000,
    ) -> ToolResult:
        """Execute a read-only query on the MySQL database."""
        try:
            config = get_db_config()

            # Clean and validate the query
            query = query.strip()
            if query.endswith(";"):
                query = query[:-1].strip()

            # Check for multiple statements
            if self._contains_multiple_statements(query):
                return ToolResult(error="不允许执行多个SQL语句")

            # Normalize query for validation
            query_normalized = " ".join(query.lower().split())

            # List of allowed read-only statement prefixes
            allowed_prefixes = ["select", "show", "describe", "desc", "explain", "with"]

            if not any(
                query_normalized.startswith(prefix) for prefix in allowed_prefixes
            ):
                return ToolResult(
                    error="只允许执行SELECT、WITH、SHOW、DESCRIBE和EXPLAIN查询"
                )

            # Check for dangerous keywords
            has_dangerous, dangerous_word = self._contains_dangerous_keywords(
                query_normalized
            )
            if has_dangerous:
                return ToolResult(
                    error=f"查询包含潜在危险的关键词'{dangerous_word}'。只允许只读操作。"
                )

            params = params or []

            with MySQLConnection(config) as conn:
                cursor = conn.cursor()

                # Only add LIMIT if query doesn't already have one and it's a SELECT query
                if "limit" not in query_normalized and query_normalized.startswith(
                    "select"
                ):
                    query = f"{query} LIMIT {row_limit}"

                cursor.execute(query, params)

                if fetch_all:
                    results = cursor.fetchall()
                else:
                    results = [cursor.fetchone()]

                # Convert results to list of dictionaries
                result_data = [dict(row) for row in results if row is not None]

                return ToolResult(
                    output={
                        "data": result_data,
                        "metadata": {
                            "query": query,
                            "params": params,
                            "row_count": len(result_data),
                            "fetch_all": fetch_all,
                            "row_limit": row_limit,
                            "timestamp": datetime.now().isoformat(),
                        },
                    }
                )

        except pymysql.Error as e:
            return ToolResult(error=f"MySQL错误: {str(e)}")
        except Exception as e:
            return ToolResult(error=f"执行查询时出错: {str(e)}")

    def _contains_multiple_statements(self, sql: str) -> bool:
        """Check if SQL contains multiple statements."""
        in_single_quote = False
        in_double_quote = False
        escaped = False
        for char in sql:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == "'" and not in_double_quote:
                in_single_quote = not in_single_quote
            elif char == '"' and not in_single_quote:
                in_double_quote = not in_double_quote
            elif char == ";" and not in_single_quote and not in_double_quote:
                return True
        return False

    def _contains_dangerous_keywords(self, sql: str) -> tuple[bool, str]:
        """Check for dangerous keywords in SQL."""
        dangerous_keywords = [
            "insert",
            "update",
            "delete",
            "drop",
            "create",
            "alter",
            "truncate",
            "replace",
            "merge",
            "call",
            "exec",
            "execute",
            "grant",
            "revoke",
            "set",
            "reset",
            "flush",
            "kill",
            "load",
            "import",
            "outfile",
            "dumpfile",
            "into outfile",
            "into dumpfile",
            "load_file",
        ]

        # Remove string literals to avoid false positives
        cleaned_sql = sql
        cleaned_sql = re.sub(r"'[^']*'", "''", cleaned_sql)
        cleaned_sql = re.sub(r'"[^"]*"', '""', cleaned_sql)
        cleaned_sql = re.sub(r"`[^`]*`", "``", cleaned_sql)
        cleaned_sql = " ".join(cleaned_sql.lower().split())

        for keyword in dangerous_keywords:
            pattern = r"\b" + re.escape(keyword) + r"\b"
            if re.search(pattern, cleaned_sql):
                return True, keyword
        return False, ""


class MySQLListTables(BaseTool):
    """列出MySQL数据库中的所有表。"""

    name: str = "mysql_list_tables"
    description: str = "列出MySQL数据库中的所有表"
    parameters: dict = {"type": "object", "properties": {}, "required": []}

    async def execute(self) -> ToolResult:
        """List all tables in the database."""
        try:
            config = get_db_config()

            with MySQLConnection(config) as conn:
                cursor = conn.cursor()
                cursor.execute("SHOW TABLES")
                results = cursor.fetchall()

                # Extract table names from the results
                table_names = []
                for row in results:
                    table_name = list(row.values())[0]
                    table_names.append(table_name)

                table_list = sorted(table_names)
                result_text = f"数据库中共有 {len(table_list)} 个表：\n" + "\n".join(
                    [f"  - {table}" for table in table_list]
                )
                return ToolResult(output=result_text)

        except pymysql.Error as e:
            return ToolResult(error=f"MySQL error: {str(e)}")
        except Exception as e:
            return ToolResult(error=f"Error listing tables: {str(e)}")


class MySQLDescribeTable(BaseTool):
    """获取表结构的详细信息。"""

    name: str = "mysql_describe_table"
    description: str = "获取表结构的详细信息，包括列、类型和约束"
    parameters: dict = {
        "type": "object",
        "properties": {
            "table_name": {
                "type": "string",
                "description": "要描述的表名",
            }
        },
        "required": ["table_name"],
    }

    async def execute(self, table_name: str) -> ToolResult:
        """Get table schema information."""
        try:
            config = get_db_config()

            with MySQLConnection(config) as conn:
                cursor = conn.cursor()

                # Verify table exists
                cursor.execute("SHOW TABLES LIKE %s", [table_name])
                if not cursor.fetchone():
                    return ToolResult(error=f"Table '{table_name}' does not exist")

                # Get table schema
                cursor.execute(f"DESCRIBE `{table_name}`")
                columns = cursor.fetchall()

                columns_data = [dict(row) for row in columns]
                result_text = f"表 '{table_name}' 的结构信息：\n"
                result_text += "列名\t\t类型\t\t\t允许空值\t键\t\t默认值\t\t额外信息\n"
                result_text += "-" * 80 + "\n"
                for col in columns_data:
                    result_text += f"{col.get('Field', '')}\t\t{col.get('Type', '')}\t\t{col.get('Null', '')}\t\t{col.get('Key', '')}\t\t{col.get('Default', '')}\t\t{col.get('Extra', '')}\n"
                return ToolResult(output=result_text)

        except pymysql.Error as e:
            return ToolResult(error=f"MySQL error: {str(e)}")
        except Exception as e:
            return ToolResult(error=f"Error describing table: {str(e)}")


class MySQLShowTableIndexes(BaseTool):
    """显示特定表的索引。"""

    name: str = "mysql_show_table_indexes"
    description: str = "显示特定表的索引"
    parameters: dict = {
        "type": "object",
        "properties": {
            "table_name": {
                "type": "string",
                "description": "Name of the table to show indexes for",
            }
        },
        "required": ["table_name"],
    }

    async def execute(self, table_name: str) -> ToolResult:
        """Show table indexes."""
        try:
            config = get_db_config()

            with MySQLConnection(config) as conn:
                cursor = conn.cursor()

                # Verify table exists
                cursor.execute("SHOW TABLES LIKE %s", [table_name])
                if not cursor.fetchone():
                    return ToolResult(error=f"Table '{table_name}' does not exist")

                # Get table indexes
                cursor.execute(f"SHOW INDEX FROM `{table_name}`")
                indexes = cursor.fetchall()

                return ToolResult(output=[dict(row) for row in indexes])

        except pymysql.Error as e:
            return ToolResult(error=f"MySQL error: {str(e)}")
        except Exception as e:
            return ToolResult(error=f"Error showing indexes: {str(e)}")


class MySQLShowCreateTable(BaseTool):
    """显示特定表的CREATE TABLE语句。"""

    name: str = "mysql_show_create_table"
    description: str = "显示特定表的CREATE TABLE语句"
    parameters: dict = {
        "type": "object",
        "properties": {
            "table_name": {
                "type": "string",
                "description": "Name of the table to show CREATE statement for",
            }
        },
        "required": ["table_name"],
    }

    async def execute(self, table_name: str) -> ToolResult:
        """Show CREATE TABLE statement."""
        try:
            config = get_db_config()

            with MySQLConnection(config) as conn:
                cursor = conn.cursor()

                # Verify table exists
                cursor.execute("SHOW TABLES LIKE %s", [table_name])
                if not cursor.fetchone():
                    return ToolResult(error=f"Table '{table_name}' does not exist")

                # Get CREATE TABLE statement
                cursor.execute(f"SHOW CREATE TABLE `{table_name}`")
                result = cursor.fetchone()

                if result:
                    create_statement = list(result.values())[1]
                    return ToolResult(output=create_statement)
                else:
                    return ToolResult(
                        error=f"Could not retrieve CREATE TABLE statement for '{table_name}'"
                    )

        except pymysql.Error as e:
            return ToolResult(error=f"MySQL error: {str(e)}")
        except Exception as e:
            return ToolResult(error=f"Error showing create table: {str(e)}")


class MySQLGetDatabaseInfo(BaseTool):
    """获取MySQL数据库的基本信息。"""

    name: str = "mysql_get_database_info"
    description: str = "获取MySQL数据库的基本信息，包括版本、用户和表数量"
    parameters: dict = {"type": "object", "properties": {}, "required": []}

    async def execute(self) -> ToolResult:
        """Get database information."""
        try:
            config = get_db_config()

            with MySQLConnection(config) as conn:
                cursor = conn.cursor()

                info = {}

                # Get database name
                cursor.execute("SELECT DATABASE()")
                result = cursor.fetchone()
                info["database_name"] = list(result.values())[0] if result else None

                # Get MySQL version
                cursor.execute("SELECT VERSION()")
                result = cursor.fetchone()
                info["mysql_version"] = list(result.values())[0] if result else None

                # Get current user
                cursor.execute("SELECT USER()")
                result = cursor.fetchone()
                info["current_user"] = list(result.values())[0] if result else None

                # Get table count
                cursor.execute("SHOW TABLES")
                info["table_count"] = len(cursor.fetchall())

                result_text = "数据库信息：\n"
                result_text += f"  数据库名称: {info.get('database_name', 'N/A')}\n"
                result_text += f"  MySQL版本: {info.get('mysql_version', 'N/A')}\n"
                result_text += f"  当前用户: {info.get('current_user', 'N/A')}\n"
                result_text += f"  表数量: {info.get('table_count', 0)}\n"
                return ToolResult(output=result_text)

        except pymysql.Error as e:
            return ToolResult(error=f"MySQL error: {str(e)}")
        except Exception as e:
            return ToolResult(error=f"Error getting database info: {str(e)}")


class MySQLSaveQueryResults(BaseTool):
    """将查询结果保存到文件（JSON或CSV格式）。"""

    name: str = "mysql_save_query_results"
    description: str = "将查询结果保存到temp_data文件夹，支持JSON或CSV格式"
    parameters: dict = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The SQL query that was executed",
            },
            "data": {
                "type": "array",
                "description": "The query results to save",
                "items": {"type": "object"},
            },
            "file_format": {
                "type": "string",
                "description": "Format to save in ('json' or 'csv')",
                "enum": ["json", "csv"],
            },
            "params": {
                "type": "array",
                "description": "Query parameters used",
                "default": [],
            },
            "custom_filename": {
                "type": "string",
                "description": "Custom filename (without extension). If None, auto-generates",
            },
        },
        "required": ["query", "data", "file_format"],
    }

    async def execute(
        self,
        query: str,
        data: List[Dict[str, Any]],
        file_format: str,
        params: Optional[List[Any]] = None,
        custom_filename: Optional[str] = None,
    ) -> ToolResult:
        """Save query results to file."""
        try:
            # Ensure temp_data directory exists
            os.makedirs("temp_data", exist_ok=True)

            if custom_filename:
                # Use custom filename, sanitize it for safety
                safe_filename = "".join(
                    c
                    for c in custom_filename
                    if c.isalnum() or c in (" ", "_", "-", ".")
                ).strip()
                safe_filename = safe_filename.replace(" ", "_")
                # Remove any existing extension
                if "." in safe_filename:
                    safe_filename = safe_filename.rsplit(".", 1)[0]
                filename = f"{safe_filename}.{file_format}"
            else:
                # Auto-generate filename with timestamp
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

                # Create a safe filename from query (first 50 chars, replace unsafe chars)
                query_snippet = query.replace("\n", " ").replace("\r", "")[:50]
                safe_query = "".join(
                    c for c in query_snippet if c.isalnum() or c in (" ", "_", "-")
                ).strip()
                safe_query = safe_query.replace(" ", "_")

                filename = f"query_{timestamp}_{safe_query}.{file_format}"

            filepath = os.path.join("temp_data", filename)

            if file_format.lower() == "json":
                # Save as JSON with metadata
                output_data = {
                    "metadata": {
                        "timestamp": datetime.now().isoformat(),
                        "query": query,
                        "params": params,
                        "row_count": len(data),
                        "filename": filename,
                    },
                    "data": data,
                }

                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(output_data, f, indent=2, ensure_ascii=False, default=str)

            elif file_format.lower() == "csv":
                # Save as CSV
                if data:
                    with open(filepath, "w", newline="", encoding="utf-8") as f:
                        writer = csv.DictWriter(f, fieldnames=data[0].keys())
                        writer.writeheader()
                        writer.writerows(data)

                    # Also save metadata as separate JSON file
                    metadata_filepath = filepath.replace(".csv", "_metadata.json")
                    metadata = {
                        "timestamp": datetime.now().isoformat(),
                        "query": query,
                        "params": params,
                        "row_count": len(data),
                        "csv_file": filename,
                    }
                    with open(metadata_filepath, "w", encoding="utf-8") as f:
                        json.dump(
                            metadata, f, indent=2, ensure_ascii=False, default=str
                        )
            else:
                return ToolResult(
                    error=f"Unsupported file format: {file_format}. Use 'json' or 'csv'."
                )

            # Get file size
            file_size = os.path.getsize(filepath)

            return ToolResult(
                output={
                    "filename": filename,
                    "format": file_format,
                    "size": self._format_file_size(file_size),
                    "row_count": len(data),
                    "filepath": filepath,
                }
            )

        except Exception as e:
            return ToolResult(error=f"Failed to save file: {str(e)}")

    def _format_file_size(self, size_bytes: int) -> str:
        """Format file size in human readable format."""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f} MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
