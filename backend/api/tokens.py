import hashlib
import secrets


def generate_reset_token():
    """Equivalent of crypto.randomBytes(32).toString('hex') in auth.js."""
    return secrets.token_hex(32)


def hash_reset_token(raw_token):
    """Equivalent of sha256(rawToken).hex() in auth.js — only this hash is
    ever stored, so a leaked DB dump can't be used to reset a password."""
    return hashlib.sha256(raw_token.encode()).hexdigest()
