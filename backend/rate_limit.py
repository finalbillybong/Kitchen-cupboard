"""In-memory sliding-window rate limiter."""

import time
from collections import defaultdict
from threading import Lock

from config import settings


class RateLimiter:
    """Tracks timestamped attempts per key and rejects when a threshold is exceeded."""

    def __init__(self, window: int, max_attempts: int):
        self._window = window
        self._max_attempts = max_attempts
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _prune(self, key: str, now: float) -> list[float]:
        """Remove attempts outside the current window and return what remains."""
        self._attempts[key] = [
            t for t in self._attempts[key] if now - t < self._window
        ]
        return self._attempts[key]

    def is_rate_limited(self, key: str) -> bool:
        with self._lock:
            return len(self._prune(key, time.time())) >= self._max_attempts

    def record_attempt(self, key: str):
        with self._lock:
            self._attempts[key].append(time.time())

    def remaining_seconds(self, key: str) -> int:
        """Seconds until the oldest attempt in the window expires."""
        now = time.time()
        with self._lock:
            attempts = self._prune(key, now)
            if not attempts:
                return 0
            return int(self._window - (now - attempts[0])) + 1


login_limiter = RateLimiter(
    window=settings.LOGIN_RATE_LIMIT_WINDOW,
    max_attempts=settings.LOGIN_RATE_LIMIT_MAX,
)

register_limiter = RateLimiter(
    window=settings.REGISTER_RATE_LIMIT_WINDOW,
    max_attempts=settings.REGISTER_RATE_LIMIT_MAX,
)
