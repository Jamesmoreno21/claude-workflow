import { ROUTES } from "../../../shared/constants";
import type { ServerMessage, UserEvent } from "../../../shared/protocol";
import { SOCKET_RECONNECT_MS } from "../constants/ui";

export interface SocketHandlers {
  onMessage(message: ServerMessage): void;
  onStatus(connected: boolean): void;
}

/** Keeps a WebSocket to the cockpit server open, reconnecting when it drops. */
export function connectSocket({ onMessage, onStatus }: SocketHandlers) {
  let socket: WebSocket | null = null;
  let retry: number | undefined;
  let closed = false;

  const open = () => {
    socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${ROUTES.socket}`);
    socket.onopen = () => onStatus(true);
    socket.onmessage = (e) => onMessage(JSON.parse(e.data) as ServerMessage);
    socket.onclose = () => {
      onStatus(false);
      if (!closed) retry = window.setTimeout(open, SOCKET_RECONNECT_MS);
    };
  };
  open();

  return {
    send: (event: UserEvent) => socket?.send(JSON.stringify(event)),
    close: () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    },
  };
}
