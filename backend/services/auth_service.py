import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import Header, HTTPException

from database.db import SessionLocal
from models.user import User


PBKDF2_ITERATIONS = 310_000
TOKEN_LIFETIME_SECONDS = 60 * 60 * 24  # 24 hours


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("utf-8"))


def hash_password(password: str) -> str:
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters long")

    salt = secrets.token_bytes(16)

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS
    )

    return (
        f"pbkdf2_sha256${PBKDF2_ITERATIONS}$"
        f"{_b64encode(salt)}${_b64encode(digest)}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored_hash.split("$", 3)

        if algorithm != "pbkdf2_sha256":
            return False

        salt = _b64decode(salt_b64)
        expected = _b64decode(digest_b64)

        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations)
        )

        return hmac.compare_digest(actual, expected)

    except (ValueError, TypeError):
        return False


def _get_auth_secret() -> bytes:
    secret = os.getenv("AUTH_SECRET_KEY")

    if not secret:
        # Local-development fallback only.
        # Before deployment set AUTH_SECRET_KEY in your hosting environment.
        secret = "face-attendance-local-development-secret-change-before-deploy"

    return secret.encode("utf-8")


def create_access_token(user_id: int) -> str:
    payload = {
        "user_id": user_id,
        "exp": int(time.time()) + TOKEN_LIFETIME_SECONDS
    }

    payload_bytes = json.dumps(
        payload,
        separators=(",", ":"),
        sort_keys=True
    ).encode("utf-8")

    payload_b64 = _b64encode(payload_bytes)

    signature = hmac.new(
        _get_auth_secret(),
        payload_b64.encode("utf-8"),
        hashlib.sha256
    ).digest()

    return f"{payload_b64}.{_b64encode(signature)}"


def decode_access_token(token: str) -> int:
    try:
        payload_b64, signature_b64 = token.split(".", 1)

        expected_signature = hmac.new(
            _get_auth_secret(),
            payload_b64.encode("utf-8"),
            hashlib.sha256
        ).digest()

        supplied_signature = _b64decode(signature_b64)

        if not hmac.compare_digest(
            expected_signature,
            supplied_signature
        ):
            raise ValueError("Invalid signature")

        payload = json.loads(
            _b64decode(payload_b64).decode("utf-8")
        )

        if int(payload["exp"]) < int(time.time()):
            raise ValueError("Token expired")

        return int(payload["user_id"])

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired login token",
            headers={"WWW-Authenticate": "Bearer"}
        )


def get_current_user(
    authorization: str | None = Header(default=None)
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Login required",
            headers={"WWW-Authenticate": "Bearer"}
        )

    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_id = decode_access_token(token)

    db = SessionLocal()

    try:
        user = db.query(User).filter(
            User.id == user_id
        ).first()

        if not user:
            raise HTTPException(
                status_code=401,
                detail="User account not found",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Detach the object before closing this short-lived DB session.
        db.expunge(user)
        return user

    finally:
        db.close()
