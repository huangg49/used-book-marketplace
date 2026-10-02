const frames = [...document.querySelectorAll("iframe")];
const scale = document.querySelector("#scale");
function send(type, value) {
  frames.forEach((f) =>
    f.contentWindow.postMessage({ type, value }, location.origin),
  );
}
scale.addEventListener("change", () => {
  send("scale", Number(scale.value));
  document
    .querySelectorAll(".overview [data-open]")
    .forEach(
      (b) =>
        (b.querySelector("img").src =
          `evidence/${b.dataset.open}-${scale.value}.png`),
    );
});
frames.forEach((f) =>
  f.addEventListener("load", () => send("scale", Number(scale.value))),
);
function showDirection(value) {
  document.querySelector("#direction").value = value;
  document.querySelector(".overview").hidden = value !== "all";
  document.querySelector(".directions").hidden = value === "all";
  document
    .querySelectorAll(".direction")
    .forEach(
      (d) => (d.hidden = value !== "all" && d.dataset.direction !== value),
    );
  document
    .querySelector(".directions")
    .classList.toggle("solo", value !== "all");
}
document
  .querySelector("#direction")
  .addEventListener("change", (e) => showDirection(e.target.value));
document.querySelector(".overview").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (b) showDirection(b.dataset.open);
});
document.querySelector("#reset").addEventListener("click", () => send("reset"));
fetch("assets/sources.json")
  .then((r) => r.json())
  .then((s) => {
    const list = document.createElement("ul");
    s.forEach((source) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = source.source;
      a.textContent = source.repo.replaceAll("_", " / ").replaceAll("-", " ");
      a.target = "_blank";
      a.rel = "noreferrer";
      li.append(a);
      list.append(li);
    });
    document.querySelector("#sources").append(list);
  });
