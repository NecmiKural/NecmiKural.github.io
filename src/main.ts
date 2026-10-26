// The only script on page load. On desktops and tablets it opens 3D mode once the HTML page has
// painted; on phones, with reduced motion, with Save-Data, without WebGL 2, or after the visitor
// powered 3D mode off, the page stays as it is and "Open in 3D" loads it on request.

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
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  const media = (query: string) => matchMedia(query).matches;
  let busy = false;

  // Phones: narrow, or a touch screen whose short side is under 600 px (sideways, or a phone
  // asking for the desktop site). They keep the light HTML page. index.html sizes the button by
  // the same rule.
  const phone = media("(max-width: 599px)") || (media("(pointer: coarse)") && Math.min(screen.width, screen.height) < 600);
  let auto = !phone && !saveData && !media("(prefers-reduced-motion: reduce)") && pref("nk.3d") !== "off";
  // The visitor has not started on the page: followed a link to a project, scrolled or moved focus.
  const untouched = () => !location.hash && scrollY === 0 && document.activeElement === document.body;

  // `asked`: the visitor pressed the button. Opening on its own stays silent when it cannot.
  const open = async (asked: boolean) => {
    if (busy) return;
    say("");
    const stored = pref("nk.lowpower");
    const lowPower = stored ? stored === "on" : media("(pointer: coarse)") || saveData;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { antialias: !lowPower, powerPreference: lowPower ? "low-power" : "default" });
    if (!gl) {
      if (asked) say("3D mode needs WebGL 2, which this browser does not provide. Everything on this page works without it.");
      return;
    }
    busy = true;
    try {
      const { boot } = await import("./engine/boot.ts");
      // On its own, and the visitor started on the page while it downloaded: leave the page be. A
      // press on the button meanwhile (which clears `auto`) asked for it.
      if (!asked && auto && !untouched()) return;
      await boot({ canvas, gl, lowPower, opener: power, say });
    } catch {
      if (asked) say("3D mode did not load. Check your connection and try again; everything on this page works without it.");
    } finally {
      busy = false;
    }
  };

  power.addEventListener("click", () => {
    auto = false;
    try {
      localStorage.setItem("nk.3d", "on"); // asked for it: open on its own next time too
    } catch {
      // Without storage the choice lasts for this visit only.
    }
    void open(true);
  });

  // After load and two frames, so the HTML page is what paints first and stays the largest paint;
  // and only if the visitor has not started on it, or opened or powered off 3D mode, meanwhile.
  if (auto) {
    addEventListener(
      "load",
      () =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (auto && untouched() && pref("nk.3d") !== "off") void open(false);
          }),
        ),
      { once: true },
    );
  }
}
