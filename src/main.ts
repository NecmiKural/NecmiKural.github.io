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

// A moving project visual (scripts/render.ts) shows its first frame until played. The button swaps
// the image's src with its data-play, so a second press stops it. Delegated, so the copy of a
// project in the 3D panel plays too.
for (const b of document.querySelectorAll<HTMLButtonElement>("button.play")) b.hidden = false;
document.addEventListener("click", (e) => {
  const b = e.target instanceof Element ? e.target.closest("button.play") : null;
  const img = b?.parentElement?.querySelector("img[data-play]");
  if (!b?.firstChild || !(img instanceof HTMLImageElement)) return;
  const next = img.dataset.play as string;
  img.dataset.play = img.getAttribute("src") as string;
  img.src = next;
  b.firstChild.textContent = next.endsWith("-still.gif") ? "Play the demo" : "Stop the demo";
});

// The project list: collapsed in the page flow on narrow screens, a column beside the content on
// wide ones (index.html), where it is open and marks the project being read: the last one whose
// top has passed a line near the top of the window; at the foot of the page, the one linked to if
// it is in view, else the last.
const toc = document.getElementById("toc");
if (toc instanceof HTMLDetailsElement) {
  const wide = matchMedia("(min-width: 1080px)");
  const links = [...toc.querySelectorAll("a")];
  const articles = links.map((a) => document.getElementById(a.hash.slice(1)));
  let queued = false;
  const mark = () => {
    queued = false;
    const line = Math.min(innerHeight / 3, 120); // a short article must not hand the mark to the next
    let i = wide.matches ? articles.findLastIndex((el) => !!el && el.getBoundingClientRect().top <= line) : -1;
    if (wide.matches && scrollY + innerHeight >= document.documentElement.scrollHeight - 2) {
      const target = links.findIndex((a) => a.hash === location.hash);
      const box = articles[target]?.getBoundingClientRect();
      i = box && box.bottom > 0 && box.top < innerHeight ? target : links.length - 1;
    }
    links.forEach((a, j) => (j === i ? a.setAttribute("aria-current", "location") : a.removeAttribute("aria-current")));
  };
  const later = () => {
    if (!queued) requestAnimationFrame(mark);
    queued = true;
  };
  const fit = () => {
    toc.open = wide.matches;
    mark();
  };
  addEventListener("scroll", later, { passive: true });
  addEventListener("hashchange", later);
  wide.addEventListener("change", fit);
  fit();
}
