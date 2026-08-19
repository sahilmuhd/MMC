(function () {
  "use strict";

  /* ======================================================
     DATA LAYER — structured so this can later be swapped
     for a fetch() call to a JSON endpoint / API without
     touching any HTML.
     ====================================================== */

  const RULES_DATA = [
    {
      title: "Business Ethics",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 L20 6 L20 12 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 12 L4 6 Z"/><path d="M9 12 L11 14 L15.5 9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      items: [
        "Always maintain honesty and transparency.",
        "Follow company policies and procedures.",
        "Respect customers and team members.",
        "Never make misleading promises.",
        "Protect the company's reputation."
      ]
    },
    {
      title: "Team Building Rules",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20 C3 16 5.5 14 8 14 C10.5 14 13 16 13 20" stroke-linecap="round"/><path d="M14.5 20 C14.5 17 16.3 15.3 18 15.3 C19.7 15.3 21 17 21 20" stroke-linecap="round"/></svg>',
      items: [
        "Help every new member.",
        "Build a positive team culture.",
        "Share knowledge openly.",
        "Encourage collaboration.",
        "Lead by example."
      ]
    },
    {
      title: "Performance Standards",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20 L4 12 M10 20 L10 8 M16 20 L16 4 M20 20 L20 14" stroke-linecap="round"/></svg>',
      items: [
        "Meet monthly business goals.",
        "Stay active in company activities.",
        "Complete assigned tasks consistently.",
        "Track personal progress.",
        "Maintain continuous growth."
      ]
    },
    {
      title: "Leadership Standards",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.3 L17.2 19.2 L12 16.2 L6.8 19.2 L8 13.3 L3.5 9.3 L9.5 8.5 Z" stroke-linejoin="round"/></svg>',
      items: [
        "Inspire team members.",
        "Communicate professionally.",
        "Resolve conflicts respectfully.",
        "Support team success.",
        "Accept accountability."
      ]
    },
    {
      title: "Recognition Policy",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 L7 21 L12 18 L17 21 L15.5 12.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      items: [
        "Achievements are awarded only after verification.",
        "Qualification must satisfy company requirements.",
        "Recognition depends on both performance and leadership.",
        "Company decisions regarding ranks are final."
      ]
    }
  ];

  const RANK_ICONS = {
    star:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    twoStar:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="8 2 9.8 6.2 14.4 6.6 11.1 9.5 12.1 14 8 11.5 3.9 14 4.9 9.5 1.6 6.6 6.2 6.2 8 2"/><polygon points="17 7 18.2 9.8 21.2 10.1 19 12 19.7 15 17 13.5 14.3 15 15 12 12.8 10.1 15.8 9.8 17 7"/></svg>`,
    executive:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`,
    silver:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M8 14l-3 7h14l-3-7"/></svg>`,
    pearl:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="21" y2="12"/></svg>`,
    emerald:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3L8 9l4 13 4-13-3-6"/><line x1="2" y1="9" x2="22" y2="9"/></svg>`,
    gold:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M8.5 12.5L7 21l5-3 5 3-1.5-8.5"/></svg>`,
    platinum:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.5 7 7.5 1-5.5 5.3 1.3 7.7L12 19.5l-6.8 3.5 1.3-7.7L1 10l7.5-1z"/></svg>`,
    diamond:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.7 10.3L7 4h10l4.3 6.3L12 20z"/><line x1="7" y1="4" x2="12" y2="20"/><line x1="17" y1="4" x2="12" y2="20"/><line x1="2.7" y1="10.3" x2="21.3" y2="10.3"/></svg>`,
    blueDiamond:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.7 10.3L7 4h10l4.3 6.3L12 20z"/><line x1="7" y1="4" x2="12" y2="20"/><line x1="17" y1="4" x2="12" y2="20"/><line x1="2.7" y1="10.3" x2="21.3" y2="10.3"/><circle cx="12" cy="12" r="2"/></svg>`,
    royalDiamond: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l3-5h14l3 5-10 12z"/><path d="M2 9l4 3 6-8 6 8 4-3"/></svg>`,
    crownDiamond: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l3-5h14l3 5-10 12z"/><path d="M2 9l4 3 6-8 6 8 4-3"/><line x1="7" y1="14" x2="17" y2="14"/></svg>`,
    kohinoor:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 15l-4.9 2.2.9-5.5L4 7.8l5.5-.8z"/><path d="M12 7v10"/><path d="M8.5 10.5l7 0"/></svg>`,
    dblKohinoor:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2l1.8 3.6 4 .6L12 8.7l.7 3.9L9 10.8l-3.7 1.8.7-3.9L3.2 6.2l4-.6z"/><path d="M17 8l1.2 2.4 2.6.4-1.9 1.8.4 2.6L17 14l-2.3 1.2.4-2.6L13.2 10.8l2.6-.4z"/></svg>`,
    kingAmbassador:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l3-6 3 4 3-6 3 4 3-4 3 6v2H3v-2z"/><rect x="3" y="17" width="18" height="3" rx="1"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`,
  };

  const RECOGNITION_DATA = [
    { rank: 1,  icon: RANK_ICONS.star,          title: "Star",            desc: "The first milestone — your journey officially begins.",
      rules: ["Personal business: 2,000 pts", "Team size: 5 members", "Active for 1 month"] },
    { rank: 2,  icon: RANK_ICONS.twoStar,        title: "2 Star",          desc: "Consistency starts to compound into visible growth.",
      rules: ["Personal business: 5,000 pts", "Team size: 10 members", "2 consecutive active months"] },
    { rank: 3,  icon: RANK_ICONS.executive,      title: "Executive",        desc: "You've stepped into a recognized leadership role.",
      rules: ["Team growth: 20 members", "Personal business: 10,000 pts", "1 trained downline leader"] },
    { rank: 4,  icon: RANK_ICONS.silver,         title: "Silver",           desc: "A proven track record of steady team development.",
      rules: ["Team growth: 40 members", "Personal business: 20,000 pts", "3 active team leaders"] },
    { rank: 5,  icon: RANK_ICONS.pearl,          title: "Pearl",            desc: "Refined leadership with measurable regional impact.",
      rules: ["Team growth: 75 members", "Personal business: 35,000 pts", "Monthly consistency: 3 months"] },
    { rank: 6,  icon: RANK_ICONS.emerald,        title: "Emerald",          desc: "A flourishing, multi-layered downline network.",
      rules: ["Team growth: 120 members", "Personal business: 55,000 pts", "5 active team leaders"] },
    { rank: 7,  icon: RANK_ICONS.gold,           title: "Gold",             desc: "A gold-standard leader recognized company-wide.",
      rules: ["Team growth: 200 members", "Personal business: 80,000 pts", "Leadership training completed"] },
    { rank: 8,  icon: RANK_ICONS.platinum,       title: "Platinum",         desc: "Elite performance sustained across the entire network.",
      rules: ["Team growth: 350 members", "Personal business: 120,000 pts", "10 active team leaders"] },
    { rank: 9,  icon: RANK_ICONS.diamond,        title: "Diamond",          desc: "A cornerstone leader shaping the network's direction.",
      rules: ["Team growth: 600 members", "Personal business: 180,000 pts", "Regional consistency: 6 months"] },
    { rank: 10, icon: RANK_ICONS.blueDiamond,    title: "Blue Diamond",     desc: "Multi-regional influence with proven mentorship depth.",
      rules: ["Team growth: 1,000 members", "Personal business: 260,000 pts", "15 active team leaders"] },
    { rank: 11, icon: RANK_ICONS.royalDiamond,   title: "Royal Diamond",    desc: "Recognized among the network's most trusted leaders.",
      rules: ["Team growth: 1,600 members", "Personal business: 380,000 pts", "Business ethics review passed"] },
    { rank: 12, icon: RANK_ICONS.crownDiamond,   title: "Crown Diamond",    desc: "A crowning achievement built on a decade of discipline.",
      rules: ["Team growth: 2,500 members", "Personal business: 520,000 pts", "25 active team leaders"] },
    { rank: 13, icon: RANK_ICONS.kohinoor,       title: "Kohinoor",         desc: "A rare, exceptional standard reserved for the very few.",
      rules: ["Team growth: 4,000 members", "Personal business: 750,000 pts", "Company council approval"] },
    { rank: 14, icon: RANK_ICONS.dblKohinoor,    title: "Double Kohinoor",  desc: "Doubling an already extraordinary standard of leadership.",
      rules: ["Team growth: 6,500 members", "Personal business: 1,100,000 pts", "40 active team leaders"] },
    { rank: 15, icon: RANK_ICONS.kingAmbassador, title: "King Ambassador",  desc: "The pinnacle of the network — its most senior ambassador.",
      rules: ["Team growth: 10,000+ members", "Personal business: 1,600,000 pts", "Lifetime ethics compliance"] }
  ];

  const SUPPORT_DATA = [
    {
      title: "Training Support",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8 L12 4 L21 8 L12 12 Z" stroke-linejoin="round"/><path d="M7 10.5 L7 15.5 C7 17 9.2 18.5 12 18.5 C14.8 18.5 17 17 17 15.5 L17 10.5"/></svg>',
      items: ["Weekly training", "Product education", "Business workshops", "Leadership coaching"]
    },
    {
      title: "Mentorship",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20 C4 15.5 7.5 13 12 13 C16.5 13 20 15.5 20 20" stroke-linecap="round"/></svg>',
      items: ["One-to-one mentoring", "Team strategy sessions", "Goal planning", "Performance reviews"]
    },
    {
      title: "Marketing Support",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M3 9 L21 9" /><path d="M8 20 L16 20" /></svg>',
      items: ["Promotional materials", "Social media templates", "Presentation slides", "Marketing videos"]
    },
    {
      title: "Technical Support",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.2"/><path d="M12 3 L12 5.5 M12 18.5 L12 21 M21 12 L18.5 12 M5.5 12 L3 12 M18 6 L16.2 7.8 M7.8 16.2 L6 18 M18 18 L16.2 16.2 M7.8 7.8 L6 6" stroke-linecap="round"/></svg>',
      items: ["Website assistance", "Dashboard guidance", "Registration support", "Customer onboarding"]
    },
    {
      title: "Community Support",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="9" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M2.5 20 C2.5 16 5 14 8 14 C11 14 13.5 16 13.5 20" stroke-linecap="round"/><path d="M15 20 C15 17.2 16.6 15.6 18.2 15.6 C19.8 15.6 21.5 17.2 21.5 20" stroke-linecap="round"/></svg>',
      items: ["Recognition events", "Team meetings", "Networking opportunities", "Achievement celebrations"]
    }
  ];

  /* ---------- Render: Rules & Instructions ---------- */
  const rulesGrid = document.getElementById("rulesGrid");
  if (rulesGrid) {
    rulesGrid.innerHTML = RULES_DATA.map((r, i) => `
      <div class="rule-card" data-reveal data-delay="${Math.min(i, 3)}">
        <div class="rule-icon">${r.icon}</div>
        <h3>${r.title}</h3>
        <ul class="rule-list">${r.items.map((it) => `<li>${it}</li>`).join("")}</ul>
      </div>
    `).join("");
  }

  /* ---------- Render: Achievement cards + timeline ---------- */
  const recognitionCards = document.getElementById("recognitionCards");
  const timelineScroll = document.getElementById("timelineScroll");

  if (recognitionCards) {
    recognitionCards.innerHTML = RECOGNITION_DATA.map((r, i) => {
      let tierClass = "rank-card--starter";
      if (r.rank >= 5 && r.rank <= 8) tierClass = "rank-card--premium";
      if (r.rank >= 9) tierClass = "rank-card--elite";

      return `
        <div class="rank-card ${tierClass}" data-rank="${r.rank}" data-reveal data-delay="${Math.min(i % 4, 3)}">
          <div class="rank-card-inner">
            <div class="rank-card-top">
              <div class="rank-glyph">${r.icon}</div>
              <span class="rank-number">${String(r.rank).padStart(2, "0")} / 15</span>
            </div>
            <h3 class="rank-title">${r.title}</h3>
            <p class="rank-desc">${r.desc}</p>
            <span class="rank-toggle">Qualification Rules
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9 L12 15 L18 9" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <div class="rank-rules-panel">
              <ul class="rank-rules-list">${r.rules.map((rule) => `<li>${rule}</li>`).join("")}</ul>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  if (timelineScroll) {
    timelineScroll.innerHTML = RECOGNITION_DATA.map((r, i) => {
      let tierClass = "timeline-dot--starter";
      if (r.rank >= 5 && r.rank <= 8) tierClass = "timeline-dot--premium";
      if (r.rank >= 9) tierClass = "timeline-dot--elite";

      return `
        ${i > 0 ? '<div class="timeline-line"></div>' : ""}
        <div class="timeline-node">
          <div class="timeline-dot ${tierClass}" data-rank="${r.rank}" title="${r.title}">
            <span>${r.icon}</span>
            <span class="tl-label">${r.title}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  setActiveRank(1);

  /* ---------- Sync: clicking a rank card or timeline dot glows both ---------- */
  function setActiveRank(rank) {
    document.querySelectorAll(".rank-card").forEach((card) => {
      card.classList.toggle("active", card.dataset.rank === String(rank));
    });
    document.querySelectorAll(".timeline-dot").forEach((dot) => {
      dot.classList.toggle("active", dot.dataset.rank === String(rank));
    });
  }

  document.querySelectorAll(".rank-card").forEach((card) => {
    card.addEventListener("click", () => {
      const isActive = card.classList.contains("active");
      setActiveRank(isActive ? null : card.dataset.rank);
      if (!isActive) {
        const dot = document.querySelector(`.timeline-dot[data-rank="${card.dataset.rank}"]`);
        if (dot) dot.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    });
  });

  document.querySelectorAll(".timeline-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      const card = document.querySelector(`.rank-card[data-rank="${dot.dataset.rank}"]`);
      const isActive = dot.classList.contains("active");
      setActiveRank(isActive ? null : dot.dataset.rank);
      if (!isActive && card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  /* ---------- Render: Team Support ---------- */
  const supportGrid = document.getElementById("supportGrid");
  if (supportGrid) {
    supportGrid.innerHTML = SUPPORT_DATA.map((s, i) => `
      <div class="support-card" data-reveal data-delay="${Math.min(i, 3)}">
        <div class="support-icon">${s.icon}</div>
        <h3>${s.title}</h3>
        <ul class="support-list">${s.items.map((it) => `<li>${it}</li>`).join("")}</ul>
      </div>
    `).join("");
  }

  const TEAM_DATA = [
    { initials: "AK", name: "Arjun Kapoor", role: "Managing Partner" },
    { initials: "PM", name: "Priya Menon", role: "Head of Strategy" },
    { initials: "DR", name: "David Reyes", role: "Chief Risk Officer" },
    { initials: "LT", name: "Lena Tran", role: "Director of Client Relations" }
  ];

  const FAQ_DATA = [
    { q: "How do I get started with MMC?", a: "Reach out through our contact form or book an introductory call. A member of our team will walk you through the onboarding process and the options available to you." },
    { q: "How are achievement ranks calculated?", a: "Ranks are based on a combination of personal business volume, team growth, and leadership consistency, verified monthly against the criteria listed in each rank's Qualification Rules." },
    { q: "Is there a minimum commitment required?", a: "There's no fixed minimum commitment. Progress through the achievement ranks at your own pace — consistency matters more than speed." },
    { q: "What kind of support will I receive?", a: "You'll have access to training, mentorship, marketing materials, technical support, and a broader community — all outlined in our Team Support section above." },
    { q: "Who do I contact for account issues?", a: "Use the Contact section below, or reach our technical support team directly — response times are typically within one business day." }
  ];

  /* ---------- Render: Team ---------- */
  const teamGrid = document.getElementById("teamGrid");
  if (teamGrid) {
    teamGrid.innerHTML = TEAM_DATA.map((m, i) => `
      <div class="team-card" data-reveal data-delay="${Math.min(i, 3)}">
        <div class="team-avatar">${m.initials}</div>
        <h3>${m.name}</h3>
        <p class="team-role">${m.role}</p>
        <div class="socials">
          <a href="#" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="none"><path d="M6.94 8.5H4V20h2.94V8.5ZM5.47 7.13A1.7 1.7 0 1 0 5.47 3.73 1.7 1.7 0 0 0 5.47 7.13ZM20 20h-2.94v-6.02c0-1.44-.03-3.28-2-3.28-2 0-2.31 1.56-2.31 3.18V20H9.8V8.5h2.82v1.57h.04c.39-.74 1.36-1.53 2.8-1.53 3 0 3.54 1.97 3.54 4.54V20Z" fill="currentColor"/></svg></a>
          <a href="#" aria-label="X / Twitter"><svg viewBox="0 0 24 24" fill="none"><path d="M4 4l16 16M20 4 4 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></a>
        </div>
      </div>
    `).join("");
  }

  /* ---------- Testimonial slider ---------- */
  const track = document.getElementById("testimonialTrack");
  const dotsWrap = document.getElementById("testimonialDots");
  if (track && dotsWrap) {
    const slides = Array.from(track.children);
    let current = 0;
    let autoplayTimer = null;

    dotsWrap.innerHTML = slides.map((_, i) => `<button aria-label="Go to testimonial ${i + 1}" data-i="${i}"></button>`).join("");
    const dots = Array.from(dotsWrap.children);

    function goTo(i) {
      current = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${current * 100}%)`;
      dots.forEach((d, di) => d.classList.toggle("active", di === current));
    }
    function restartAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer);
      autoplayTimer = setInterval(() => goTo(current + 1), 6000);
    }

    dots.forEach((d) => d.addEventListener("click", () => { goTo(Number(d.dataset.i)); restartAutoplay(); }));
    document.getElementById("testimonialPrev").addEventListener("click", () => { goTo(current - 1); restartAutoplay(); });
    document.getElementById("testimonialNext").addEventListener("click", () => { goTo(current + 1); restartAutoplay(); });

    let touchStartX = null;
    track.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1));
      touchStartX = null;
      restartAutoplay();
    }, { passive: true });

    goTo(0);
    restartAutoplay();
  }

  /* ---------- FAQ accordion ---------- */
  const faqList = document.getElementById("faqList");
  if (faqList) {
    faqList.innerHTML = FAQ_DATA.map((f, i) => `
      <div class="faq-item" data-reveal data-delay="${Math.min(i, 3)}">
        <button class="faq-question" aria-expanded="false">
          <span>${f.q}</span>
          <span class="faq-plus"></span>
        </button>
        <div class="faq-answer"><p>${f.a}</p></div>
      </div>
    `).join("");

    faqList.querySelectorAll(".faq-item").forEach((item) => {
      const btn = item.querySelector(".faq-question");
      const answer = item.querySelector(".faq-answer");
      btn.addEventListener("click", () => {
        const isOpen = item.classList.contains("open");
        faqList.querySelectorAll(".faq-item.open").forEach((openItem) => {
          if (openItem !== item) {
            openItem.classList.remove("open");
            openItem.querySelector(".faq-question").setAttribute("aria-expanded", "false");
            openItem.querySelector(".faq-answer").style.maxHeight = null;
          }
        });
        item.classList.toggle("open", !isOpen);
        btn.setAttribute("aria-expanded", String(!isOpen));
        answer.style.maxHeight = isOpen ? null : answer.scrollHeight + "px";
      });
    });
  }

  /* ---------- Newsletter form ---------- */
  const newsletterForm = document.getElementById("newsletterForm");
  if (newsletterForm) {
    newsletterForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const note = document.getElementById("newsletterNote");
      const emailInput = document.getElementById("newsletterEmail");
      if (!note || !emailInput || !emailInput.value) return;

      const submitBtn = newsletterForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch(`${window.MMC_API_BASE}/api/newsletter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailInput.value }),
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          note.textContent = data.alreadySubscribed
            ? "You're already on the list."
            : "Thanks — you're on the list.";
          newsletterForm.reset();
        } else {
          note.textContent = data.error || "Something went wrong. Please try again.";
        }
      } catch (err) {
        note.textContent = "Network error — please try again.";
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ---------- Scroll-to-top button ---------- */
  const scrollTopBtn = document.getElementById("scrollTopBtn");
  if (scrollTopBtn) {
    window.addEventListener("scroll", () => {
      scrollTopBtn.classList.toggle("visible", window.scrollY > 600);
    }, { passive: true });
    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- Loader ---------- */
  window.addEventListener("load", () => {
    const loader = document.getElementById("loader");
    setTimeout(() => loader.classList.add("hide"), 400);
  });

  /* ---------- Sticky nav + scroll spy ---------- */
  const nav = document.getElementById("nav");
  const sections = document.querySelectorAll("section[id], header[id]");
  const navLinks = document.querySelectorAll(".nav-link");

  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 40);

    let current = "";
    sections.forEach((sec) => {
      const top = sec.offsetTop - 140;
      if (window.scrollY >= top) current = sec.id;
    });
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  const navToggle = document.getElementById("navToggle");
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    navToggle.classList.toggle("open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  navLinks.forEach((link) =>
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      navToggle.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    })
  );

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll("[data-reveal]");
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => revealObserver.observe(el));

  /* ---------- Counter animation ---------- */
  const counters = document.querySelectorAll(".stat-num");
  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.count, 10);
        const suffix = el.dataset.suffix || "";
        const duration = 1600;
        const start = performance.now();

        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(eased * target) + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        counterObserver.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  counters.forEach((el) => counterObserver.observe(el));

  /* ---------- Hero particles ---------- */
  const particleFields = document.querySelectorAll(".hero-particles");
  particleFields.forEach((particleField) => {
    const count = window.innerWidth < 760 ? 14 : 28;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "particle";
      const left = Math.random() * 100;
      const delay = Math.random() * 10;
      const duration = 8 + Math.random() * 10;
      const size = 1.5 + Math.random() * 2.5;
      p.style.left = `${left}%`;
      p.style.bottom = `-10px`;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.animationDuration = `${duration}s`;
      p.style.animationDelay = `${delay}s`;
      particleField.appendChild(p);
    }
  });

  /* ---------- Contact form validation ---------- */
  const form = document.getElementById("contactForm");
  const successMsg = document.getElementById("formSuccess");

  const validators = {
    name: (v) => v.trim().length >= 2 || "Please enter your full name.",
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address.",
    phone: (v) => /^[0-9+\-()\s]{7,}$/.test(v) || "Enter a valid phone number.",
    message: (v) => v.trim().length >= 10 || "Message should be at least 10 characters.",
  };

  if (form) {
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let valid = true;

      Object.keys(validators).forEach((name) => {
        const input = form.elements[name];
        const errorEl = form.querySelector(`[data-error="${name}"]`);
        const field = input.closest(".field");
        const result = validators[name](input.value);

        if (result !== true) {
          valid = false;
          field.classList.add("invalid");
          errorEl.textContent = result;
        } else {
          field.classList.remove("invalid");
          errorEl.textContent = "";
        }
      });

      if (!valid) {
        successMsg.classList.remove("show");
        return;
      }

      const payload = {
        name: form.elements.name.value,
        email: form.elements.email.value,
        phone: form.elements.phone.value,
        message: form.elements.message.value,
      };

      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch(`${window.MMC_API_BASE}/api/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          successMsg.textContent = "Thank you — your inquiry has been received.";
          successMsg.classList.add("show");
          form.reset();
          setTimeout(() => successMsg.classList.remove("show"), 5000);
        } else if (data.errors) {
          Object.entries(data.errors).forEach(([name, msg]) => {
            const input = form.elements[name];
            const errorEl = form.querySelector(`[data-error="${name}"]`);
            if (input && errorEl) {
              input.closest(".field").classList.add("invalid");
              errorEl.textContent = msg;
            }
          });
        } else {
          successMsg.textContent = data.error || "Something went wrong. Please try again.";
          successMsg.classList.add("show");
        }
      } catch (err) {
        successMsg.textContent = "Network error — please check your connection and try again.";
        successMsg.classList.add("show");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    // live-clear errors while typing
    Object.keys(validators).forEach((name) => {
      const input = form.elements[name];
      input.addEventListener("input", () => {
        const field = input.closest(".field");
        if (validators[name](input.value) === true) {
          field.classList.remove("invalid");
          form.querySelector(`[data-error="${name}"]`).textContent = "";
        }
      });
    });
  }

  /* ======================================================
     CMS CONTENT LOADER — pulls hero copy (home.html) and the
     achievements section heading (index.html) from the admin
     panel's Site Content editor, if the backend is reachable.
     Every element is only touched when the CMS actually has a
     value for it, and any fetch/parse failure is swallowed --
     the hardcoded HTML already in the page is the fallback, so
     this never blanks out real content on a slow/offline backend.
     ====================================================== */
  function escapeCmsText(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function loadCmsContent() {
    const page = document.body.dataset.page;
    if (!window.MMC_API_BASE || (page !== "home.html" && page !== "index.html")) return;

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.textContent = value;
    };

    if (page === "home.html") {
      try {
        const res = await fetch(`${window.MMC_API_BASE}/api/content/homepage/`);
        if (!res.ok) return;
        const json = await res.json();
        const data = (json.content && json.content.data) || {};

        setText("cmsHeroBadge", data.badge);
        if (data.hero_title) {
          document.getElementById("cmsHeroTitle").innerHTML = escapeCmsText(data.hero_title).replace(/\n/g, "<br>");
        }
        setText("cmsHeroSub", data.hero_subtitle);

        const primaryBtn = document.getElementById("cmsCtaPrimary");
        if (primaryBtn) {
          if (data.cta_primary_label) primaryBtn.textContent = data.cta_primary_label;
          if (data.cta_primary_url) primaryBtn.setAttribute("href", data.cta_primary_url);
        }
        const secondaryBtn = document.getElementById("cmsCtaSecondary");
        if (secondaryBtn) {
          if (data.cta_secondary_label) secondaryBtn.textContent = data.cta_secondary_label;
          if (data.cta_secondary_url) secondaryBtn.setAttribute("href", data.cta_secondary_url);
        }

        if (Array.isArray(data.stats) && data.stats.length) {
          const wrap = document.getElementById("cmsHeroStats");
          if (wrap) {
            wrap.innerHTML = data.stats
              .map((s) => `<div><span class="mono">${escapeCmsText(s.value || "")}</span><small>${escapeCmsText(s.label || "")}</small></div>`)
              .join("");
          }
        }
      } catch { /* backend unreachable -- keep the hardcoded hero */ }
    }

    if (page === "index.html") {
      try {
        const res = await fetch(`${window.MMC_API_BASE}/api/content/achievements/`);
        if (!res.ok) return;
        const json = await res.json();
        const data = (json.content && json.content.data) || {};
        setText("cmsAchEyebrow", data.eyebrow);
        setText("cmsAchHeading", data.heading);
      } catch { /* backend unreachable -- keep the hardcoded heading */ }
    }
  }

  document.addEventListener("DOMContentLoaded", loadCmsContent);
})();
