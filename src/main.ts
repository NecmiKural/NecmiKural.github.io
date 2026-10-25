// The only script on page load. On a click of "Power on" it checks for WebGL 2 and loads 3D mode.
// Without a click it downloads nothing else and changes nothing.

const power = document.getElementById("power");
const line = document.getElementById("power-status");

const pref = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

if (power instanceof HTMLButtonElement && line) {
  const say = (text: string) => {
    line.textContent = text;
  };
  let busy = false;
  power.addEventListener("click", async () => {
    if (busy) return;
    say("");
    const stored = pref("nk.lowpower");
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const lowPower = stored ? stored === "on" : matchMedia("(pointer: coarse)").matches || saveData === true;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { antialias: !lowPower, powerPreference: lowPower ? "low-power" : "default" });
    if (!gl) {
      say("3D mode needs WebGL 2, which this browser does not provide. Everything on this page works without it.");
      return;
    }
    busy = true;
    try {
      const { boot } = await import("./engine/boot.ts");
      await boot({ canvas, gl, lowPower, opener: power, say });
    } catch {
      say("3D mode did not load. Check your connection and try again; everything on this page works without it.");
    } finally {
      busy = false;
    }
  });
}
