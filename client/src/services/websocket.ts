// ============================================================
// WebSocket Service — Real-time Pipeline Progress Tracking
// ============================================================

import type { WSMessage } from '@shared/types.js';

type MessageHandler = (message: WSMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private currentProjectId: string | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: any = null;
  private isExplicitlyClosed = false;

  connect(projectId: string): void {
    if (
      this.currentProjectId === projectId &&
      (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.disconnect();
    this.currentProjectId = projectId;
    this.isExplicitlyClosed = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?projectId=${encodeURIComponent(projectId)}`;

    const socket = new WebSocket(wsUrl);
    this.ws = socket;

    socket.onopen = () => {
      if (this.isExplicitlyClosed || this.ws !== socket) {
        try { socket.close(); } catch {}
        return;
      }
      console.log(`[WS] Connected to project: ${projectId}`);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage;
        this.handlers.forEach((handler) => handler(data));
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    socket.onclose = () => {
      if (!this.isExplicitlyClosed && this.ws === socket) {
        // Try to reconnect in 3s
        this.reconnectTimer = setTimeout(() => {
          if (this.currentProjectId) {
            this.connect(this.currentProjectId);
          }
        }, 3000);
      }
    };

    socket.onerror = () => {
      // Suppress noisy error logs on client disconnect
    };
  }

  disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => {
          try { socket.close(); } catch {}
        };
      } else if (socket.readyState === WebSocket.OPEN) {
        try { socket.close(); } catch {}
      }
    }
    this.currentProjectId = null;
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

export const wsService = new WebSocketService();
