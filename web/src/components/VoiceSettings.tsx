import { useEffect, useRef, useState } from "react";
import { speak, updateSettings, useTts, VOICES, type Provider } from "../tts";

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: "kokoro", label: "Kokoro", hint: "Neural voice in your browser. Free and private; ~90 MB one-time download. English only." },
  { id: "elevenlabs", label: "ElevenLabs", hint: "Most natural and multilingual. Needs ELEVENLABS_API_KEY in the MCP server env." },
  { id: "openai", label: "OpenAI", hint: "Natural and multilingual. Needs OPENAI_API_KEY in the MCP server env." },
  { id: "browser", label: "System voice", hint: "Your OS voice. Instant, but robotic." },
];

const SAMPLE = "Here's the plan. We'll add a limiter in front of the login route, and lock the account after five failed attempts.";

export function VoiceSettings() {
  const tts = useTts();
  const { settings } = tts;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const enabled = (p: Provider) => (p === "elevenlabs" || p === "openai" ? tts.available[p] : true);
  const voices = VOICES[settings.provider];

  return (
    <div className="voice-settings" ref={ref}>
      <button className={`icon ${tts.speaking ? "speaking" : ""}`} title="Narration settings" onClick={() => setOpen(!open)}>
        {settings.muted ? "🔇" : "🔊"}
      </button>
      {open && (
        <div className="popover">
          <div className="pop-row">
            <b>Narration</b>
            <label className="switch">
              <input type="checkbox" checked={!settings.muted} onChange={(e) => updateSettings({ muted: !e.target.checked })} />
              {settings.muted ? "Off" : "On"}
            </label>
          </div>

          <div className="providers">
            {PROVIDERS.map((p) => (
              <label key={p.id} className={`provider ${settings.provider === p.id ? "on" : ""} ${enabled(p.id) ? "" : "disabled"}`}>
                <input
                  type="radio"
                  name="provider"
                  disabled={!enabled(p.id)}
                  checked={settings.provider === p.id}
                  onChange={() => updateSettings({ provider: p.id })}
                />
                <div>
                  <b>{p.label}</b>
                  <small>{p.hint}</small>
                </div>
              </label>
            ))}
          </div>

          {voices && (
            <label className="pop-field">
              Voice
              <select
                value={settings.voices[settings.provider] ?? voices[0].id}
                onChange={(e) => updateSettings({ voices: { ...settings.voices, [settings.provider]: e.target.value } })}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="pop-field">
            Speed {settings.speed.toFixed(2)}×
            <input type="range" min={0.8} max={1.4} step={0.05} value={settings.speed} onChange={(e) => updateSettings({ speed: Number(e.target.value) })} />
          </label>

          {settings.provider === "kokoro" && tts.model !== "ready" && (
            <div className="model-status">
              {tts.model === "loading" ? (
                <>
                  <div className="replay-bar">
                    <div style={{ width: `${tts.progress}%` }} />
                  </div>
                  <small>Downloading voice model… {Math.round(tts.progress)}%</small>
                </>
              ) : tts.model === "error" ? (
                <small className="err">Couldn't load Kokoro; using the system voice.</small>
              ) : (
                <small className="muted">The model downloads the first time it speaks.</small>
              )}
            </div>
          )}
          {settings.provider === "kokoro" && tts.model === "ready" && <small className="muted">Running on {tts.device === "webgpu" ? "GPU" : "CPU"}</small>}
          {tts.error && <small className="err">{tts.error}</small>}

          <button className="ghost" disabled={settings.muted} onClick={() => speak(SAMPLE)}>
            ▶ Test voice
          </button>
        </div>
      )}
    </div>
  );
}
