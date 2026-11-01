import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ServerMessage, UserEvent, WorkflowState } from "../../shared/protocol";

export function useConnection() {
  const [state, setState] = useState<WorkflowState | null>(null);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: number | undefined;
    const connect = () => {
      const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      ws.current = sock;
      sock.onopen = () => setConnected(true);
      sock.onmessage = (e) => {
        const msg = JSON.parse(e.data) as ServerMessage;
        if (msg.type === "state") setState(msg.state);
      };
      sock.onclose = () => {
        setConnected(false);
        if (!stopped) retry = window.setTimeout(connect, 1000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, []);

  const send = (event: UserEvent) => ws.current?.send(JSON.stringify(event));
  return { state, connected, send };
}

export interface Focus {
  /** What a voice or chat message refers to right now, e.g. "question:q2". */
  about?: string;
  label?: string;
}

export const AppContext = createContext<{
  state: WorkflowState;
  send: (e: UserEvent) => void;
  focus: Focus;
  setFocus: (f: Focus) => void;
}>(null!);

export const useApp = () => useContext(AppContext);
