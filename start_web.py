#!/usr/bin/env python3
"""
OpenManus Web 启动脚本
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="启动OpenManus Web界面")
    parser.add_argument(
        "--port", type=int, default=8001, help="Web服务端口 (默认: 8001)"
    )
    parser.add_argument("--host", default="0.0.0.0", help="Web服务主机 (默认: 0.0.0.0)")
    parser.add_argument("--reload", action="store_true", help="开启热重载")

    args = parser.parse_args()

    print(f"🚀 启动OpenManus Web界面...")
    print(f"📍 访问地址: http://localhost:{args.port}")

    try:
        import uvicorn

        from app.web.app import app

        uvicorn.run(
            app, host=args.host, port=args.port, reload=args.reload, log_level="info"
        )
    except ImportError as e:
        print(f"❌ 缺少依赖包: {e}")
        print("请安装: pip install uvicorn fastapi")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 启动失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
