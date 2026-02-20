import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for real-time list collaboration."""

    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, list_id: str):
        await websocket.accept()
        self.active_connections[list_id].add(websocket)

    def disconnect(self, websocket: WebSocket, list_id: str):
        conns = self.active_connections.get(list_id)
        if conns is None:
            return
        conns.discard(websocket)
        if not conns:
            del self.active_connections[list_id]

    async def broadcast_to_list(self, list_id: str, message: dict):
        conns = self.active_connections.get(list_id)
        if not conns:
            return
        payload = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            conns.discard(ws)


manager = ConnectionManager()
