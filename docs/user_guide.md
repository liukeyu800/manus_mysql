# OpenManus 用户使用指南

## 🎯 概述

OpenManus是一个多功能的AI Agent框架，经过优化后专注于：
- 代码执行和开发
- 数据分析和可视化
- 数据库操作（MySQL）
- 文件操作和管理
- MCP工具扩展

## 🚀 快速开始

### 1. 环境准备

```bash
# 1. 克隆仓库
git clone https://github.com/FoundationAgents/OpenManus.git
cd OpenManus

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置LLM
cp config/config.example.toml config/config.toml
# 编辑config.toml，设置你的LLM配置
```

### 2. 基础配置

编辑 `config/config.toml`：

```toml
[llm]
model = "claude-3-7-sonnet-20250219"
base_url = "https://api.anthropic.com/v1/"
api_key = "YOUR_API_KEY"
max_tokens = 8192
temperature = 0.0
```

### 3. 运行演示

```bash
# 运行使用演示
python examples/usage_demo.py

# 运行MySQL工具演示（需要配置数据库）
python examples/mysql_demo.py
```

## 🔧 主要功能

### 1. Python代码执行

**功能**：执行Python代码片段，支持数据分析、计算、可视化等。

**使用方式**：
```python
from app.tool.python_execute import PythonExecute

python_tool = PythonExecute()
result = await python_tool.execute(code="""
import pandas as pd
data = {'name': ['Alice', 'Bob'], 'age': [25, 30]}
df = pd.DataFrame(data)
print(df)
""")
print(result['observation'])
```

### 2. MySQL数据库操作

**功能**：安全的只读数据库查询、表结构查看、数据导出。

**配置**：
```bash
export MYSQL_USER="your_username"
export MYSQL_PASSWORD="your_password"
export MYSQL_DATABASE="your_database"
export MYSQL_HOST="127.0.0.1"      # 可选
export MYSQL_PORT="3306"           # 可选
```

**使用方式**：
```python
from app.tool import MySQLReadQuery, MySQLListTables

# 查询数据
query_tool = MySQLReadQuery()
result = await query_tool.execute(
    query="SELECT * FROM users LIMIT 10",
    row_limit=10
)

# 列出表
tables_tool = MySQLListTables()
tables = await tables_tool.execute()
```

**可用MySQL工具**：
- `MySQLReadQuery` - 执行SELECT查询
- `MySQLListTables` - 列出所有表
- `MySQLDescribeTable` - 查看表结构
- `MySQLShowTableIndexes` - 显示表索引
- `MySQLShowCreateTable` - 显示建表语句
- `MySQLGetDatabaseInfo` - 获取数据库信息
- `MySQLSaveQueryResults` - 保存查询结果到文件

### 3. 文件操作

**功能**：创建、读取、编辑、搜索文件。

**使用方式**：
```python
from app.tool import StrReplaceEditor

editor = StrReplaceEditor()

# 创建文件
await editor.execute(
    command="create",
    path="example.py",
    file_text="print('Hello World')"
)

# 读取文件
content = await editor.execute(command="view", path="example.py")

# 编辑文件
await editor.execute(
    command="str_replace",
    path="example.py",
    old_str="Hello World",
    new_str="Hello OpenManus"
)
```

### 4. 数据可视化

**功能**：生成图表、创建数据报告。

**使用方式**：
```python
from app.tool.chart_visualization.data_visualization import DataVisualization

viz_tool = DataVisualization()
result = await viz_tool.execute(
    chart_type="line",
    data=[{"x": 1, "y": 10}, {"x": 2, "y": 20}],
    title="示例图表"
)
```

### 5. Bash命令执行

**功能**：执行系统命令。

**使用方式**：
```python
from app.tool import Bash

bash_tool = Bash()
result = await bash_tool.execute(command="ls -la")
print(result)
```

## 🤖 Agent使用

### 1. Manus通用Agent

**特点**：包含所有可用工具的通用Agent，支持MCP扩展。

**使用方式**：
```python
from app.agent.manus import Manus

# 创建Agent
manus = await Manus.create()

# 查看可用工具
for tool in manus.available_tools:
    print(f"- {tool.name}: {tool.description}")

# 执行任务（需要实现对话逻辑）
# 清理资源
await manus.cleanup()
```

### 2. DataAnalysis数据分析Agent

**特点**：专门用于数据分析任务，包含Python执行、数据可视化、MySQL等工具。

**使用方式**：
```python
from app.agent.data_analysis import DataAnalysis

# 创建数据分析Agent
data_agent = DataAnalysis()

# 查看可用工具
print(f"包含 {len(list(data_agent.available_tools))} 个工具")
```

## 📊 实际使用场景

### 场景1：数据分析项目

```python
# 1. 连接数据库查询数据
mysql_tool = MySQLReadQuery()
data_result = await mysql_tool.execute(
    query="SELECT * FROM sales_data WHERE date >= '2024-01-01'"
)

# 2. 使用Python分析数据
python_tool = PythonExecute()
analysis_result = await python_tool.execute(code=f"""
import pandas as pd
import numpy as np

# 加载数据
data = {data_result.output['data']}
df = pd.DataFrame(data)

# 分析
monthly_sales = df.groupby('month')['amount'].sum()
print("月度销售统计:")
print(monthly_sales)
""")

# 3. 生成可视化图表
viz_tool = DataVisualization()
chart_result = await viz_tool.execute(
    chart_type="bar",
    data=monthly_sales.to_dict(),
    title="月度销售趋势"
)

# 4. 保存结果
save_tool = MySQLSaveQueryResults()
await save_tool.execute(
    query="SELECT * FROM sales_data",
    data=data_result.output['data'],
    file_format="csv",
    custom_filename="sales_analysis"
)
```

### 场景2：代码开发与测试

```python
# 1. 创建Python脚本
editor = StrReplaceEditor()
await editor.execute(
    command="create",
    path="data_processor.py",
    file_text="""
def process_data(data):
    # 数据处理逻辑
    return [x * 2 for x in data]

if __name__ == "__main__":
    test_data = [1, 2, 3, 4, 5]
    result = process_data(test_data)
    print(f"处理结果: {result}")
"""
)

# 2. 执行测试
bash_tool = Bash()
test_result = await bash_tool.execute(command="python data_processor.py")
print(f"测试结果: {test_result}")

# 3. 代码优化
python_tool = PythonExecute()
await python_tool.execute(code="""
# 性能测试
import time
import numpy as np

def process_data_optimized(data):
    return np.array(data) * 2

# 测试性能
data = list(range(100000))
start_time = time.time()
result = process_data_optimized(data)
end_time = time.time()
print(f"优化后处理时间: {end_time - start_time:.4f}秒")
""")
```

## 🔧 工具集合使用

**创建自定义工具集合**：
```python
from app.tool import ToolCollection, PythonExecute, StrReplaceEditor

# 创建特定用途的工具集合
analysis_tools = ToolCollection(
    PythonExecute(),
    MySQLReadQuery(),
    DataVisualization()
)

# 使用工具集合
result = await analysis_tools.execute(
    name="python_execute",
    tool_input={"code": "print('分析开始')"}
)
```

## 🛠️ MCP扩展

**配置MCP服务器**：
```json
// config/mcp.json
{
  "mcpServers": {
    "custom_server": {
      "type": "stdio",
      "command": "python",
      "args": ["custom_mcp_server.py"]
    }
  }
}
```

## ⚠️ 注意事项

### 安全性
- MySQL工具只支持只读操作
- 危险SQL语句会被自动阻止
- Python代码执行有超时限制

### 性能
- 大数据查询建议设置适当的row_limit
- 长时间运行的代码会被超时终止
- 文件操作会在workspace目录下进行

### 故障排除
1. **LLM连接问题**：检查API密钥和网络连接
2. **MySQL连接失败**：确认环境变量和数据库权限
3. **Python执行错误**：检查代码语法和依赖包安装
4. **文件权限问题**：确保workspace目录可写

## 📚 更多资源

- 查看 `examples/` 目录获取更多示例
- 阅读 `docs/mysql_integration.md` 了解数据库功能
- 参考 `config/` 目录的配置示例
- 查看各工具的源码了解详细参数
