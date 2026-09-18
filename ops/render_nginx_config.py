"""Render the public nginx template with validated deployment values."""
import argparse
import ipaddress
from pathlib import Path
import re


HOST_RE = re.compile(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
TEMPLATE = Path(__file__).resolve().parent / "nginx" / "plotmio.conf.template"


def valid_host(value: str) -> str:
    normalized = value.strip().lower().rstrip(".")
    if not HOST_RE.fullmatch(normalized):
        raise argparse.ArgumentTypeError("application host must be a DNS hostname")
    return normalized


def valid_ip(value: str) -> str:
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("observability address must be an IP address") from exc


def render(host: str, source_ip: str, vpn_ip: str) -> str:
    result = TEMPLATE.read_text(encoding="utf-8")
    replacements = {
        "__APPLICATION_HOST__": host,
        "__OBSERVABILITY_SOURCE_IP__": source_ip,
        "__OBSERVABILITY_VPN_IP__": vpn_ip,
    }
    for marker, value in replacements.items():
        result = result.replace(marker, value)
    if "__" in result:
        raise RuntimeError("unresolved nginx template placeholder")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--application-host", type=valid_host, required=True)
    parser.add_argument("--observability-source-ip", type=valid_ip, required=True)
    parser.add_argument("--observability-vpn-ip", type=valid_ip, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(
        render(args.application_host, args.observability_source_ip, args.observability_vpn_ip),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
