let currentSlide = 0;
let slideCount = 6;
let slideshowData = null;

// Parse URL for /wrap/0x... or ?address=0x...
function loadFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/\/wrap\/(0x[a-fA-F0-9]{40})/);
  if (match) return match[1];

  const params = new URLSearchParams(window.location.search);
  return params.get("address") || null;
}

async function main() {
  const address = loadFromUrl();
  if (address) {
    document.getElementById("connect").style.display = "none";
    document.getElementById("loading").style.display = "flex";
    await fetchWrap(address);
  } else {
    document.getElementById("loading").style.display = "none";
  }
}

document.getElementById("wrapBtn").addEventListener("click", async () => {
  const input = document.getElementById("addressInput").value.trim();
  if (!input || !input.startsWith("0x") || input.length !== 42) {
    alert("Please enter a valid 0x wallet address (42 characters)");
    return;
  }
  document.getElementById("connect").style.display = "none";
  document.getElementById("loading").style.display = "flex";
  await fetchWrap(input);
});

document.getElementById("addressInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("wrapBtn").click();
});

async function fetchWrap(address) {
  try {
    const res = await fetch("/api/txwrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Request failed");
    }

    const data = (await res.json()).data;
    slideshowData = data;
    renderSlideshow(address, data);
  } catch (err) {
    document.getElementById("loading").innerHTML = `
      <p style="color:#ef4444">Error: ${err.message}</p>
      <button onclick="location.reload()" class="btn" style="margin-top:16px">Try Again</button>
    `;
  }
}

function renderSlideshow(address, data) {
  const { metrics, personality } = data;

  document.getElementById("loading").style.display = "none";
  document.getElementById("slidesWrapper").style.display = "block";

  // Slide 1: Cover
  document.getElementById("coverAddress").textContent = `${address.slice(0, 10)}...${address.slice(-6)}`;
  document.getElementById("coverYear").textContent = new Date().getFullYear();

  // Slide 2: Archetype
  document.getElementById("archetypeTitle").textContent = personality.title;
  document.getElementById("archetypeRoast").textContent = personality.roast;

  // Slide 3: Stats
  document.getElementById("statBalance").textContent = `${metrics.balanceEth} ETH`;
  document.getElementById("statTx").textContent = metrics.totalTx;
  document.getElementById("statGas").textContent = `${metrics.gasBurnedEth} ETH`;
  document.getElementById("statSwaps").textContent = metrics.swapCount;

  // Slide 4: Scores
  animateBar("barDefi", metrics.defiScore);
  animateBar("barAirdrop", metrics.airdropScore);
  animateBar("barDegen", metrics.degenScore);
  animateBar("barWhale", metrics.whaleometer);
  document.getElementById("scoreDefi").textContent = metrics.defiScore;
  document.getElementById("scoreAirdrop").textContent = metrics.airdropScore;
  document.getElementById("scoreDegen").textContent = metrics.degenScore;
  document.getElementById("scoreWhale").textContent = metrics.whaleometer;

  // Slide 5: Fun Facts
  const factsList = document.getElementById("funFacts");
  factsList.innerHTML = "";
  personality.funFacts.forEach((fact) => {
    const li = document.createElement("li");
    li.textContent = fact;
    factsList.appendChild(li);
  });

  // Slide 6: Verdict
  document.getElementById("verdictText").textContent = `"${personality.verdict}"`;

  // Update counter
  updateCounter();
}

function animateBar(id, value) {
  const bar = document.getElementById(id);
  requestAnimationFrame(() => {
    bar.style.width = `${value}%`;
  });
}

function updateCounter() {
  document.getElementById("slideCounter").textContent = `${currentSlide + 1} / ${slideCount}`;
  document.getElementById("prevBtn").disabled = currentSlide === 0;
  document.getElementById("nextBtn").disabled = currentSlide === slideCount - 1;
}

document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentSlide > 0) {
    document.querySelector(`[data-slide="${currentSlide}"]`).classList.remove("active");
    currentSlide--;
    document.querySelector(`[data-slide="${currentSlide}"]`).classList.add("active");
    updateCounter();
  }
});

document.getElementById("nextBtn").addEventListener("click", () => {
  if (currentSlide < slideCount - 1) {
    document.querySelector(`[data-slide="${currentSlide}"]`).classList.remove("active");
    currentSlide++;
    document.querySelector(`[data-slide="${currentSlide}"]`).classList.add("active");
    updateCounter();
  }
});

// Keyboard nav
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") document.getElementById("prevBtn").click();
  if (e.key === "ArrowRight") document.getElementById("nextBtn").click();
});

// Save as Image
document.getElementById("saveBtn").addEventListener("click", async () => {
  const container = document.getElementById("slidesContainer");
  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      allowTaint: false,
      logging: false,
    });
    const link = document.createElement("a");
    link.download = `txwrap-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    alert("Failed to generate image: " + err.message);
  }
});

// Share on X
document.getElementById("shareBtn").addEventListener("click", () => {
  const url = window.location.href;
  const text = `📊 Check out my wallet wrap! 🎰\n\n${url}\n\n#OKXAI #TxWrap`;
  window.open(
    `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`,
    "_blank",
    "width=600,height=400"
  );
});

main();
