"""Run with: python -m security_gateway"""

import os
from pathlib import Path

from .envfile import load_env_file
from .server import serve


if __name__ == "__main__":
    load_env_file(Path(os.getenv("ENV_FILE", ".env")))
    serve()
