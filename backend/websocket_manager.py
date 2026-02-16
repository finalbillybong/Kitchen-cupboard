import json
from typing import Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for real-time list collaboration."""

    def __init__(self):
        # list_id -> set of websocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, list_id: str):
        await websocket.accept()
        if list_id not in self.active_connections:
            self.active_connections[list_id] = set()
        self.active_connections[list_id].add(websocket)

    def disconnect(self, websocket: WebSocket, list_id: str):
        if list_id in self.active_connections:
            self.active_connections[list_id].discard(websocket)
            if not self.active_connections[list_id]:
                del self.active_connections[list_id]

    async def broadcast_to_list(self, list_id: str, message: dict):
        if list_id not in self.active_connections:
            return
        dead = []
        for ws in self.active_connections[list_id]:
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections[list_id].discard(ws)


manager = ConnectionManager()
