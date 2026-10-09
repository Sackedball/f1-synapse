"""Main entry point for F1 Synapse."""

import logging
import socket
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn
from src.web.config import config


def find_free_port(start_port: int, max_attempts: int = 50) -> int:
    """Find a free TCP port starting from start_port."""
    for p in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', p))
                return p
            except OSError:
                continue
    return start_port


def main():
    if "--verbose" not in sys.argv:
        logging.getLogger("fastf1").setLevel(logging.CRITICAL)

    if "--cli" in sys.argv:
        from src.cli.race_selection import cli_load
        cli_load()
        sys.exit(0)

    requested_port = config.port
    if "--port" in sys.argv:
        p_idx = sys.argv.index("--port") + 1
        if p_idx < len(sys.argv):
            requested_port = int(sys.argv[p_idx])

    port = find_free_port(requested_port)
    if port != requested_port:
        print(f"Notice: Port {requested_port} in use; bound to port {port}.")

    host = config.host
    if "--host" in sys.argv:
        h_idx = sys.argv.index("--host") + 1
        if h_idx < len(sys.argv):
            host = sys.argv[h_idx]

    url = f"http://{host}:{port}"
    if "--year" in sys.argv and "--round" in sys.argv:
        y_idx = sys.argv.index("--year") + 1
        r_idx = sys.argv.index("--round") + 1
        s_type = "R"
        if "--session" in sys.argv:
            s_idx = sys.argv.index("--session") + 1
            if s_idx < len(sys.argv):
                s_type = sys.argv[s_idx]
        sid = f"{sys.argv[y_idx]}_{sys.argv[r_idx]}_{s_type}"
        url += f"/?session={sid}"

    if "--no-browser" not in sys.argv:
        def _open_browser():
            import time
            time.sleep(1.2)
            webbrowser.open(url)
        threading.Thread(target=_open_browser, daemon=True).start()

    print("==============================================================")
    print(" F1 SYNAPSE — Broadcast Telemetry & Race Replay System")
    print(f" Web Interface: {url}")
    print(f" API Docs:      http://{host}:{port}/docs")
    print(" Press Ctrl+C to shut down cleanly.")
    print("==============================================================")

    try:
        uvicorn.run("src.web.app:app", host=host, port=port, log_level="info")
    except KeyboardInterrupt:
        print("\nShutting down F1 Synapse...")
    sys.exit(0)


if __name__ == "__main__":
    main()