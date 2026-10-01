"""Builds access tokens on your backend (Python 3.8+, standard library only).

Never ship the App Certificate to apps or browsers.

    from nadir_network_token import build_token

    token = build_token(
        app_id=os.environ["APP_ID"],
        app_certificate=os.environ["APP_CERTIFICATE"],
        channel="room-1",
        uid="alice",
        role="speaker",
        expire_seconds=3600,
    )
"""

import base64
import hashlib
import hmac
import json
import re
import time

ROLES = ("host", "speaker", "audience")
_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_APP_ID = re.compile(r"^[a-f0-9]{32}$")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def build_token(
    app_id: str,
    app_certificate: str,
    channel: str,
    uid: str,
    role: str,
    expire_seconds: int = 3600,
) -> str:
    """Return a token that lets `uid` join `channel` with at most `role`, for `expire_seconds`."""
    if not _APP_ID.match(app_id):
        raise ValueError("app_id must be the 32-character App ID from the console")
    if not app_certificate:
        raise ValueError("app_certificate is required")
    if not _NAME.match(channel):
        raise ValueError('channel must be 1-64 characters: letters, digits, "_", "-" or "."')
    if not _NAME.match(uid):
        raise ValueError('uid must be 1-64 characters: letters, digits, "_", "-" or "."')
    if role not in ROLES:
        raise ValueError("role must be host, speaker or audience")
    if not 1 <= expire_seconds <= 86400:
        raise ValueError("expire_seconds must be between 1 and 86400")

    iat = int(time.time())
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64url(
        json.dumps(
            {
                "v": 1,
                "appId": app_id,
                "channel": channel,
                "uid": uid,
                "role": role,
                "iat": iat,
                "exp": iat + expire_seconds,
            },
            separators=(",", ":"),
        ).encode()
    )
    signature = hmac.new(app_certificate.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(signature)}"


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 6:
        print("usage: nadir_network_token.py APP_ID APP_CERTIFICATE CHANNEL UID ROLE [EXPIRE_SECONDS]")
        sys.exit(2)
    print(build_token(*sys.argv[1:6], expire_seconds=int(sys.argv[6]) if len(sys.argv) > 6 else 3600))
