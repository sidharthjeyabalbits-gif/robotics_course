// Dex Robotics — shared behaviors

document.addEventListener("DOMContentLoaded", () => {
  // Mobile nav toggle
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
    });
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => navLinks.classList.remove("open"));
    });
  }

  // Curriculum module accordions
  document.querySelectorAll(".module-head").forEach((head) => {
    head.addEventListener("click", () => {
      const module = head.closest(".module");
      const body = module.querySelector(".module-body");
      const wasOpen = module.classList.contains("open");

      document.querySelectorAll(".module.open").forEach((m) => {
        m.classList.remove("open");
        m.querySelector(".module-body").style.maxHeight = null;
      });

      if (!wasOpen) {
        module.classList.add("open");
        body.style.maxHeight = body.scrollHeight + "px";
      }
    });
  });

  // Open first module by default on curriculum page
  const firstModule = document.querySelector(".module");
  if (firstModule) {
    firstModule.classList.add("open");
    const body = firstModule.querySelector(".module-body");
    body.style.maxHeight = body.scrollHeight + "px";
  }

  // FAQ accordions
  document.querySelectorAll(".faq-q").forEach((q) => {
    q.addEventListener("click", () => {
      const item = q.closest(".faq-item");
      item.classList.toggle("open");
    });
  });

  // BOM tier filter (DIY page)
  const chips = document.querySelectorAll(".chip[data-tier]");
  const rows = document.querySelectorAll("[data-row-tier]");
  if (chips.length && rows.length) {
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        const tier = chip.dataset.tier;
        rows.forEach((row) => {
          const rowTier = row.dataset.rowTier;
          row.style.display =
            tier === "all" || rowTier === tier || rowTier === "core" ? "" : "none";
        });
      });
    });
  }
});
