#!/usr/bin/env python3
"""Keep the self-hosted Kong REST timeout above admin RPC limits."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

CONTAINER = os.environ.get("BASE_MONITOR_KONG_CONTAINER", "supabase_kong_base-monitor")
TARGET_TIMEOUT_MS = 310_000


def run(*args: str, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(args),
        check=True,
        text=True,
        capture_output=capture,
    )


def wait_for_container() -> None:
    for _ in range(30):
        result = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", CONTAINER],
            text=True,
            capture_output=True,
        )
        if result.returncode == 0 and result.stdout.strip() == "true":
            return
        time.sleep(2)
    raise RuntimeError(f"Kong container {CONTAINER} is not running")


def service_config() -> dict[str, object]:
    result = run(
        "docker",
        "exec",
        CONTAINER,
        "wget",
        "-qO-",
        "http://127.0.0.1:8001/services/rest-v1",
        capture=True,
    )
    return json.loads(result.stdout)


def assert_effective_timeout() -> None:
    service = service_config()
    for key in ("read_timeout", "write_timeout"):
        if service.get(key) != TARGET_TIMEOUT_MS:
            raise RuntimeError(f"Kong {key} is {service.get(key)!r}, expected {TARGET_TIMEOUT_MS}")


def patch_rest_service(config: str) -> str:
    lines = config.splitlines(keepends=True)
    start = next(i for i, line in enumerate(lines) if line.strip() == "- name: rest-v1")
    end = next(
        (i for i in range(start + 1, len(lines)) if lines[i].startswith("  - name: ")),
        len(lines),
    )
    block = lines[start:end]
    url_index = next(i for i, line in enumerate(block) if line.strip().startswith("url:"))

    for key in ("read_timeout", "write_timeout"):
        match = next((i for i, line in enumerate(block) if line.strip().startswith(f"{key}:")), None)
        replacement = f"    {key}: {TARGET_TIMEOUT_MS}\n"
        if match is None:
            url_index += 1
            block.insert(url_index, replacement)
        else:
            block[match] = replacement

    return "".join(lines[:start] + block + lines[end:])


def main() -> None:
    wait_for_container()
    try:
        assert_effective_timeout()
        return
    except RuntimeError:
        pass

    fd, temp_name = tempfile.mkstemp(prefix="base-monitor-kong-", suffix=".yml")
    os.close(fd)
    temp = Path(temp_name)
    try:
        os.chmod(temp, 0o600)
        run("docker", "cp", f"{CONTAINER}:/home/kong/kong.yml", str(temp))
        patched = patch_rest_service(temp.read_text())
        temp.write_text(patched)
        run("docker", "cp", str(temp), f"{CONTAINER}:/home/kong/kong.yml")
        # Apply declarative configuration through a controlled `kong reload`.
        run("docker", "exec", CONTAINER, "kong", "reload")
        assert_effective_timeout()
    finally:
        temp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
