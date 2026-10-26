// The only script on page load. On a click of "Open in 3D" it checks for WebGL 2 and loads 3D
// mode; without a click it downloads nothing else. It also opens the project list on wide screens
// and marks the project being read in it.

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

// The project list: collapsed in the page flow on narrow screens, a column beside the content on
// wide ones (index.html), where it opens and marks the project being read: the last one whose
// top has passed a line a third of the way down, or at the foot of the page, the one linked to.
const toc = document.getElementById("toc");
if (toc instanceof HTMLDetailsElement && matchMedia("(min-width: 1080px)").matches) {
  toc.open = true;
  const links = [...toc.querySelectorAll("a")];
  const articles = links.map((a) => document.getElementById(a.hash.slice(1)));
  let queued = false;
  const mark = () => {
    queued = false;
    const seen = (el: HTMLElement | null) => !!el && el.getBoundingClientRect().top <= innerHeight / 3;
    let i = articles.findLastIndex(seen);
    const target = links.findIndex((a) => a.hash === location.hash);
    const foot = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    if (foot && target >= 0 && (articles[target]?.getBoundingClientRect().top ?? innerHeight) < innerHeight) i = target;
    links.forEach((a, j) => (j === i ? a.setAttribute("aria-current", "location") : a.removeAttribute("aria-current")));
  };
  const later = () => {
    if (!queued) requestAnimationFrame(mark);
    queued = true;
  };
  addEventListener("scroll", later, { passive: true });
  addEventListener("hashchange", later);
  mark();
}
