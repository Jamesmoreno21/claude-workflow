import { useEffect, useRef, useState } from "react";
import { usePreference } from "../config/settings";
import { NARRATION_SPEED, PROVIDER_INFO, SAMPLE_NARRATION, VOICES, type TtsProvider } from "../constants/tts";
import { speak, updateNarration, useNarrationStatus } from "../services/tts";

function ModelProgress() {
  const status = useNarrationStatus();
  if (status.model === "ready") return <small className="muted">Running on {status.device === "webgpu" ? "GPU" : "CPU"}</small>;
  if (status.model === "error") return <small className="err">Couldn't load Kokoro; using the system voice.</small>;
  if (status.model === "idle") return <small className="muted">The model downloads the first time it speaks.</small>;
  return (
    <div className="model-status">
      <div className="replay-bar">
        <div style={{ width: `${status.progress}%` }} />
      </div>
      <small>Downloading voice model… {Math.round(status.progress)}%</small>
    </div>
  );
}

/** The 🔊 popover: voice provider, voice, speed, and a test button. */
export function NarrationSettings() {
  const [narration] = usePreference("narration");
  const status = useNarrationStatus();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const configured = (provider: TtsProvider) => (provider === "elevenlabs" || provider === "openai" ? status.available[provider] : true);
  const voices = VOICES[narration.provider];

  return (
    <div className="voice-settings" ref={ref}>
      <button className={`icon ${status.speaking ? "speaking" : ""}`} title="Narration settings" onClick={() => setOpen(!open)}>
        {narration.muted ? "🔇" : "🔊"}
      </button>
      {open && (
        <div className="popover">
          <div className="pop-row">
            <b>Narration</b>
            <label className="switch">
              <input type="checkbox" checked={!narration.muted} onChange={(e) => updateNarration({ muted: !e.target.checked })} />
              {narration.muted ? "Off" : "On"}
            </label>
          </div>

          <div className="providers">
            {PROVIDER_INFO.map((p) => (
              <label key={p.id} className={`provider ${narration.provider === p.id ? "on" : ""} ${configured(p.id) ? "" : "disabled"}`}>
                <input
                  type="radio"
                  name="provider"
                  disabled={!configured(p.id)}
                  checked={narration.provider === p.id}
                  onChange={() => updateNarration({ provider: p.id })}
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
                value={narration.voices[narration.provider] ?? voices[0].id}
                onChange={(e) => updateNarration({ voices: { ...narration.voices, [narration.provider]: e.target.value } })}
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
            Speed {narration.speed.toFixed(2)}×
            <input
              type="range"
              {...NARRATION_SPEED}
              value={narration.speed}
              onChange={(e) => updateNarration({ speed: Number(e.target.value) })}
            />
          </label>

          {narration.provider === "kokoro" && <ModelProgress />}
          {status.fallbackError && <small className="err">{status.fallbackError}</small>}

          <button className="ghost" disabled={narration.muted} onClick={() => speak(SAMPLE_NARRATION)}>
            ▶ Test voice
          </button>
        </div>
      )}
    </div>
  );
}
