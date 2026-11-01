import { useEffect, useRef, useState } from "react";
import type { UserEvent, WorkflowState } from "../../../shared/protocol";
import { connectSocket } from "../services/socket";

/** The latest state from the server, plus a way to send events back. */
export function useConnection() {
  const [state, setState] = useState<WorkflowState | null>(null);
  const [connected, setConnected] = useState(false);
  const socket = useRef<ReturnType<typeof connectSocket> | null>(null);

  useEffect(() => {
    socket.current = connectSocket({ onMessage: (message) => setState(message.state), onStatus: setConnected });
    return () => socket.current?.close();
  }, []);

  const send = (event: UserEvent) => socket.current?.send(event);
  return { state, connected, send };
}
