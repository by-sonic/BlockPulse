import asyncio
import logging
import socket
import ssl
import time

log = logging.getLogger(__name__)


async def probe_tls(ip: str, port: int, sni: str, timeout: float = 8.0) -> dict:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    start = time.monotonic()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port, ssl=ctx, server_hostname=sni or ip),
            timeout=timeout,
        )
        ms = round((time.monotonic() - start) * 1000)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return {"success": 1, "latency_ms": ms, "error": ""}
    except asyncio.TimeoutError:
        return {"success": 0, "latency_ms": 0, "error": "timeout"}
    except ConnectionRefusedError:
        return {"success": 0, "latency_ms": 0, "error": "refused"}
    except ConnectionResetError:
        return {"success": 0, "latency_ms": 0, "error": "reset"}
    except ssl.SSLError as e:
        return {"success": 0, "latency_ms": 0, "error": f"tls:{e.reason}"}
    except OSError as e:
        return {"success": 0, "latency_ms": 0, "error": str(e)[:80]}


async def probe_udp(ip: str, port: int, timeout: float = 5.0) -> dict:
    start = time.monotonic()
    loop = asyncio.get_event_loop()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setblocking(False)
    try:
        await loop.sock_sendto(sock, b"\x00" * 32, (ip, port))
        try:
            await asyncio.wait_for(loop.sock_recv(sock, 1024), timeout=timeout)
            ms = round((time.monotonic() - start) * 1000)
            return {"success": 1, "latency_ms": ms, "error": ""}
        except asyncio.TimeoutError:
            return {"success": 0, "latency_ms": 0, "error": "no_response"}
    except Exception as e:
        return {"success": 0, "latency_ms": 0, "error": str(e)[:80]}
    finally:
        sock.close()


async def run_target_probes(target: dict) -> list[dict]:
    results = []
    for p in target["protocols"]:
        if p["transport"] == "udp":
            r = await probe_udp(target["ip"], p["port"])
        else:
            r = await probe_tls(target["ip"], p["port"], p.get("sni", ""))
        results.append({"target_id": target["id"], "protocol": p["name"], "port": p["port"], **r})
    return results
