# MySQL Database Integration for OpenManus

本文档介绍如何在OpenManus框架中使用MySQL数据库功能。

## 🚀 快速开始

### 1. 安装依赖

MySQL功能已经添加到`requirements.txt`中，运行以下命令安装：

```bash
pip install -r requirements.txt
```

或者单独安装PyMySQL：

```bash
pip install pymysql
```

### 2. 数据库配置

#### 方法1: 配置文件 (推荐)

1. **复制配置示例文件**：
```bash
cp config/config.example-mysql.toml config/config.toml
```

2. **编辑配置文件**，设置`[mysql]`部分：
```toml
[mysql]
host = "127.0.0.1"
port = 3306
user = "your_mysql_username"
password = "your_mysql_password"
database = "your_database_name"
charset = "utf8mb4"
connect_timeout = 30
read_timeout = 30
write_timeout = 30
```

#### 方法2: 环境变量 (兼容旧版)

如果没有配置文件，系统会自动使用环境变量：

```bash
export MYSQL_HOST="127.0.0.1"        # 可选，默认值
export MYSQL_PORT="3306"              # 可选，默认值
export MYSQL_USER="root"              # 必需
export MYSQL_PASSWORD="your_password" # 必需
export MYSQL_DATABASE="your_database" # 必需
```

#### 配置优先级

1. 配置文件中的`[mysql]`部分
2. 环境变量

#### 配置文件的优势

- ✅ 无需设置环境变量
- ✅ 配置集中管理
- ✅ 支持更多高级选项（超时时间、字符集等）
- ✅ 版本控制友好（可以忽略敏感信息）

### 3. 使用示例

#### 在Agent中使用

MySQL工具已经集成到以下Agent中：
- `DataAnalysis` - 数据分析Agent
- `Manus` - 通用Agent

#### 演示脚本

运行MySQL工具演示：

```bash
# 配置文件使用演示
python examples/mysql_config_demo.py

# 详细功能演示
python examples/mysql_usage_guide.py

# 简单使用示例
python examples/mysql_simple_example.py

# 原始演示脚本
python examples/mysql_demo.py
```

## 🔧 可用工具

### 1. mysql_read_query
执行只读SQL查询（SELECT、SHOW、DESCRIBE、EXPLAIN）

**参数：**
- `query` (string, 必需): SQL查询语句
- `params` (array, 可选): 查询参数
- `fetch_all` (boolean, 可选): 是否获取所有结果，默认true
- `row_limit` (integer, 可选): 最大返回行数，默认1000

**示例：**
```json
{
  "query": "SELECT * FROM users WHERE age > %s",
  "params": ["18"],
  "row_limit": 100
}
```

### 2. mysql_list_tables
列出数据库中的所有表

**参数：** 无

### 3. mysql_describe_table
获取表的详细结构信息

**参数：**
- `table_name` (string, 必需): 表名

### 4. mysql_show_table_indexes
显示表的索引信息

**参数：**
- `table_name` (string, 必需): 表名

### 5. mysql_show_create_table
显示表的CREATE TABLE语句

**参数：**
- `table_name` (string, 必需): 表名

### 6. mysql_get_database_info
获取数据库基本信息（版本、用户、表数量等）

**参数：** 无

### 7. mysql_save_query_results
将查询结果保存到文件

**参数：**
- `query` (string, 必需): 执行的SQL查询
- `data` (array, 必需): 查询结果数据
- `file_format` (string, 必需): 文件格式 ("json" 或 "csv")
- `params` (array, 可选): 查询参数
- `custom_filename` (string, 可选): 自定义文件名

## 🔒 安全特性

### 只读操作
- 只允许执行SELECT、SHOW、DESCRIBE、EXPLAIN、WITH查询
- 自动阻止INSERT、UPDATE、DELETE、DROP等危险操作

### SQL注入防护
- 支持参数化查询
- 自动检测和阻止危险关键词
- 防止多语句执行

### 查询限制
- 自动添加LIMIT子句防止返回过多数据
- 可配置最大返回行数
- 查询超时保护

## 📁 文件输出

查询结果会保存到 `temp_data` 目录：

### JSON格式
```json
{
  "metadata": {
    "timestamp": "2024-01-01T12:00:00",
    "query": "SELECT * FROM users",
    "params": [],
    "row_count": 100,
    "filename": "query_results.json"
  },
  "data": [
    {"id": 1, "name": "用户1"},
    {"id": 2, "name": "用户2"}
  ]
}
```

### CSV格式
- 主数据文件：`query_results.csv`
- 元数据文件：`query_results_metadata.json`

## 🛠️ 配置文件

参考 `config/config.example-mysql.toml` 配置示例。

## ⚠️ 注意事项

1. **环境变量优先级**：环境变量会覆盖配置文件中的设置
2. **连接安全**：确保数据库连接使用强密码
3. **权限控制**：建议为OpenManus创建只读数据库用户
4. **网络安全**：在生产环境中使用SSL连接

## 🧪 测试连接

使用以下代码测试数据库连接：

```python
import asyncio
from app.tool.mysql_database import MySQLGetDatabaseInfo

async def test_connection():
    tool = MySQLGetDatabaseInfo()
    result = await tool.execute()
    if result.error:
        print(f"连接失败: {result.error}")
    else:
        print(f"连接成功: {result.output}")

asyncio.run(test_connection())
```

## 🤝 集成到自定义Agent

```python
from app.tool import (
    MySQLReadQuery,
    MySQLListTables,
    MySQLDescribeTable,
    ToolCollection
)

# 创建包含MySQL工具的工具集合
tools = ToolCollection(
    MySQLReadQuery(),
    MySQLListTables(),
    MySQLDescribeTable(),
    # ... 其他工具
)
```

## 📞 技术支持

如果在使用过程中遇到问题，请：
1. 检查环境变量配置
2. 验证数据库连接权限
3. 查看错误日志
4. 运行演示脚本进行诊断

---

**注意**：MySQL工具仅支持只读操作，确保数据安全。如需写操作，请直接使用数据库管理工具。
