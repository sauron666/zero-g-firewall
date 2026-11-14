import { IconFan } from "./icons";

export function FanSwitch({ on, onChange, hint }: { on: boolean; onChange: (on: boolean) => void; hint?: string }) {
  return (
    <button type="button" className="fanswitch" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="fanswitch__track"><span className="fanswitch__knob"><IconFan size={22} /></span></span>
      <span className="fanswitch__text">
        <span className="fanswitch__state">{on ? "Fans on" : "Fans off"}</span>
        <span className="fanswitch__hint">{hint ?? (on ? "Stop the fans" : "Start the fans")}</span>
      </span>
    </button>
  );
}
