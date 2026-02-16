"""Simple in-memory rate limiter for login attempts."""
import time
from collections import defaultdict
from threading import Lock

from config import settings


class RateLimiter:
    def __init__(self):
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def is_rate_limited(self, key: str) -> bool:
        """Check if a key (IP address) has exceeded the rate limit."""
        now = time.time()
        window = settings.LOGIN_RATE_LIMIT_WINDOW
        max_attempts = settings.LOGIN_RATE_LIMIT_MAX

        with self._lock:
            # Prune old attempts outside the window
            self._attempts[key] = [
                t for t in self._attempts[key] if now - t < window
            ]
            if len(self._attempts[key]) >= max_attempts:
                return True
            return False

    def record_attempt(self, key: str):
        """Record a failed login attempt."""
        with self._lock:
            self._attempts[key].append(time.time())

    def remaining_seconds(self, key: str) -> int:
        """Seconds until the oldest attempt in the window expires."""
        now = time.time()
        window = settings.LOGIN_RATE_LIMIT_WINDOW
        with self._lock:
            attempts = [t for t in self._attempts[key] if now - t < window]
            if not attempts:
                return 0
            return int(window - (now - attempts[0])) + 1


login_limiter = RateLimiter()
