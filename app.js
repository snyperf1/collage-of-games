const TOTAL_DAYS = 30;

const catalog = Array.from({ length: TOTAL_DAYS }, (_, index) => ({
  day: index + 1,
  state: "locked",
  title: `Day ${index + 1}`,
  description: "Coming soon",
  image: "",
  href: "",
}));

catalog[0] = {
  day: 1,
  state: "open",
  title: "Skyline Rescue",
  description: "Arcade survival with dashes and pulse shots.",
  image: "./assets/day-01-skyline-rescue-thumb.png",
  href: "./games/day-01-skyline-rescue/",
};

catalog[1] = {
  day: 2,
  state: "open",
  title: "Orchard Wardens",
  description: "Protect the harvest with sprint and chime pulses.",
  image: "./assets/day-02-orchard-wardens-thumb.png",
  href: "./games/day-02-orchard-wardens/",
};

const grid = document.querySelector("#games-grid");
const stats = document.querySelector("#stats");

const complete = catalog.filter((entry) => entry.state === "open").length;
stats.textContent = `Progress: ${complete}/${TOTAL_DAYS} games live`;

catalog.forEach((entry, index) => {
  const card = document.createElement(entry.state === "open" ? "a" : "article");
  card.className = "game-card";
  card.dataset.state = entry.state;
  card.style.animationDelay = `${index * 30}ms`;

  if (entry.state === "open") {
    card.href = entry.href;
    card.setAttribute("aria-label", `Play ${entry.title}`);
  }

  const imageMarkup = entry.image
    ? `<img src="${entry.image}" alt="${entry.title} preview" loading="lazy" />`
    : "";

  card.innerHTML = `
    <div class="card-image">
      <span class="card-day">Day ${entry.day}</span>
      ${imageMarkup}
    </div>
    <div class="card-info">
      <h2 class="card-title">${entry.title}</h2>
      <p class="card-subtitle">${entry.description}</p>
    </div>
  `;

  grid.appendChild(card);
});
