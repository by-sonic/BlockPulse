#!/usr/bin/env python3
"""
BlockPulse probe — тест доступности VPN-протоколов из вашей сети.

Запуск:  python3 run.py
Код открыт, зависимостей нет (только stdlib Python 3.8+).
"""
import json
import socket
import ssl
import sys
import time
import urllib.request

API_URL = "__API_URL__"

TARGETS = "__TARGETS__"


def probe_tls(ip, port, sni, timeout=8):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    start = time.monotonic()
    try:
        raw = socket.create_connection((ip, port), timeout=timeout)
    except socket.timeout:
        return False, 0, "connect_timeout"
    except ConnectionRefusedError:
        return False, 0, "refused"
    except ConnectionResetError:
        return False, 0, "reset"
    except OSError as e:
        return False, 0, str(e)[:60]
    try:
        wrapped = ctx.wrap_socket(raw, server_hostname=sni or ip)
        ms = round((time.monotonic() - start) * 1000)
        wrapped.close()
        return True, ms, ""
    except ssl.SSLError as e:
        return False, 0, "tls:" + str(getattr(e, "reason", e))[:40]
    except socket.timeout:
        return False, 0, "tls_timeout"
    except Exception as e:
        return False, 0, str(e)[:60]
    finally:
        raw.close()


def probe_udp(ip, port, timeout=5):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    start = time.monotonic()
    try:
        sock.sendto(b"\x00" * 32, (ip, port))
        sock.recvfrom(1024)
        ms = round((time.monotonic() - start) * 1000)
        return True, ms, ""
    except socket.timeout:
        return False, 0, "no_response"
    except Exception as e:
        return False, 0, str(e)[:60]
    finally:
        sock.close()


def get_my_ip():
    for url in ["https://api.ipify.org?format=json", "https://ifconfig.me/ip"]:
        try:
            r = urllib.request.urlopen(url, timeout=5)
            text = r.read().decode().strip()
            if text.startswith("{"):
                return json.loads(text).get("ip", text)
            return text
        except Exception:
            continue
    return ""


def fetch_targets():
    """Fetch targets from API if template markers are present."""
    if API_URL.startswith("__") or TARGETS == "__TARGETS__":
        try:
            req = urllib.request.Request(API_URL.rstrip("/") + "/api/targets")
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read())
            targets = data.get("targets", [])
            result = []
            for t in targets:
                protos = []
                for p in t.get("protocols", []):
                    protos.append((p["name"], p["port"], p.get("sni", ""), p.get("transport", "tcp")))
                result.append({"id": t["id"], "ip": t["ip"], "protos": protos})
            return result
        except Exception:
            pass
    if isinstance(TARGETS, str):
        return []
    return TARGETS


def send_results(ip, results):
    data = json.dumps({"source_ip": ip, "results": results}).encode()
    req = urllib.request.Request(
        API_URL.rstrip("/") + "/api/probe",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read())
    except Exception:
        return None


def main():
    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    print()
    print("  BlockPulse \u2014 \u0442\u0435\u0441\u0442 VPN-\u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u043e\u0432")
    print("  " + "\u2500" * 50)
    print()

    targets = fetch_targets()
    if not targets:
        print("  \u274c \u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u0446\u0435\u043b\u0435\u0439.")
        return

    print("  \u041e\u043f\u0440\u0435\u0434\u0435\u043b\u044f\u0435\u043c IP...", end=" ", flush=True)
    ip = get_my_ip()
    print(ip if ip else "\u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c")
    print()

    all_results = []

    for target in targets:
        print(f"  \u0421\u0435\u0440\u0432\u0435\u0440: {target['id']} ({target['ip']})")
        print(f"  {'Proto':<22}{'Port':<8}{'Status':<16}{'Latency'}")
        print(f"  {'\u2500' * 52}")

        for name, port, sni, transport in target["protos"]:
            if transport == "udp":
                ok, ms, err = probe_udp(target["ip"], port)
            else:
                ok, ms, err = probe_tls(target["ip"], port, sni)

            status = "\u2705 OK" if ok else f"\u274c {err}"
            latency = f"{ms} ms" if ok else "\u2014"
            print(f"  {name:<22}{port:<8}{status:<16}{latency}")

            all_results.append({
                "target_id": target["id"],
                "protocol": name,
                "port": port,
                "success": int(ok),
                "latency_ms": ms,
                "error": err,
            })

        print()

    if ip:
        print("  \u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u043e\u0432...", end=" ", flush=True)
        resp = send_results(ip, all_results)
        if resp and resp.get("ok"):
            region = resp.get("region", "?")
            isp = resp.get("isp", "?")
            print(f"\u2705  [{region} / {isp}]")
        else:
            print("\u274c")
    else:
        print("  \u26a0 IP \u043d\u0435 \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0451\u043d \u2014 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b \u043d\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u044b")

    print()


if __name__ == "__main__":
    main()
