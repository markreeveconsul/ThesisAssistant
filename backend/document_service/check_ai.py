"""Run with python -m document_service.check_ai; never prints the API key."""

import asyncio

import httpx

from .ai_provider import ChatConfig, ProviderError, check_connection


async def main() -> int:
    try:
        config = ChatConfig.from_env()
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            await check_connection(config, client)
        print("PASS: The configured model returned text to the synthetic connection test.")
        print("No thesis files were sent. This does not verify retrieval, citations or answer quality.")
        return 0
    except ProviderError as exc:
        print(f"SETUP NEEDED: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
