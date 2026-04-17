// ── Network Config ───────────────────────────────────────
const ARC_CHAIN_ID  = 5042002;
const ARC_CHAIN_HEX = "0x" + ARC_CHAIN_ID.toString(16);
const ARC_RPC       = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x67F27cD0cD9BBd92FDd4A518296E398eebeD7cE8";

const PIGSAVE_ABI = [
  "function deposit() external payable",
  "function withdraw() external",
  "function getUserData(address addr) external view returns (uint256 balance, uint256 depositCount, uint256 lastDepositTime, uint256 streak)"
];

// ── App State ─────────────────────────────────────────────
let provider, signer, userAddress;
let pigSaveContract;
let currentLang = "vi";
let currentMode = "normal";    // "normal" | "purpose"
let purposeGoal = 0;           // in USDC (from localStorage)
let userData = { balance: 0n, depositCount: 0n, lastDepositTime: 0n, streak: 0n };

// ── Rank System ───────────────────────────────────────────
// Tier requires BOTH count AND volume to be met
// Count:  0 → 30 → 60 → 90 → 120
// Volume: 0 → $100 → $200 → $500 → $1000
function getRank(count, balanceUSD) {
  if (count >= 120 || balanceUSD >= 1000) return { cls: "rank-diamond-pig",   label: "💎 Diamond Pig" };
  if (count >= 90  || balanceUSD >= 500)  return { cls: "rank-golden-pig",    label: "✨ Golden Pig" };
  if (count >= 60  || balanceUSD >= 200)  return { cls: "rank-steady-pig",    label: "🏆 Steady Pig" };
  if (count >= 30  || balanceUSD >= 100)  return { cls: "rank-saving-piglet", label: "⭐ Saving Piglet" };
  return                                         { cls: "rank-piglet",        label: "🐷 Piglet" };
}

// ── Translations ──────────────────────────────────────────
const T = {
  vi: {
    earlyTitle:      "Heo chưa đủ no...",
    earlyBody:       "Bạn chưa hoàn thành chu kỳ bỏ heo 🐷\nCòn một chút nữa thôi — heo đang cố lớn!",
    earlyCount:      (done, left) => `${done} / 30 lần — còn ${left} lần nữa`,
    goalEarlyTitle:  "Chưa đến đích rồi...",
    goalEarlyBody:   "Bạn chưa đạt mục tiêu tiết kiệm 🐷\nCố thêm một chút nữa thôi!",
    goalEarlyCount:  (pct) => `Hiện tại mới được ${pct}%`,
    depositing:  "Đang bỏ heo... 🐷",
    withdrawing: "Đang đập heo...",
    depositOk:   (n) => `Bỏ heo lần ${n}! 🎉`,
    rankUp:      (r) => `Lên hạng: ${r}! 🎊`,
    withdrawOk:  "Đập heo thành công! 💰 Tiền về ví rồi!",
    txFailed:    "Giao dịch thất bại 😢",
    noBalance:   "Heo đang rỗng, bỏ tiền vào trước nhé!",
    noMeta:      "Cài MetaMask để tiếp tục!",
    connectFail: "Kết nối thất bại",
    needNetwork: "Đang chuyển sang Arc Testnet...",
    goalSet:     (g) => `Mục tiêu: ${g} USDC 🎯`,
    noGoal:      "Nhập mục tiêu trước nhé!",
  },
  en: {
    earlyTitle:      "Piggy isn't full yet...",
    earlyBody:       "You haven't hit 30 saves yet 🐷\nJust a bit more — piggy is trying to grow!",
    earlyCount:      (done, left) => `${done} / 30 — ${left} more to go`,
    goalEarlyTitle:  "Not there yet...",
    goalEarlyBody:   "You haven't reached your saving goal 🐷\nJust a little more to go!",
    goalEarlyCount:  (pct) => `Current progress: ${pct}%`,
    depositing:  "Saving to piggy... 🐷",
    withdrawing: "Breaking piggy bank...",
    depositOk:   (n) => `Save #${n} done! 🎉`,
    rankUp:      (r) => `Rank up: ${r}! 🎊`,
    withdrawOk:  "Piggy broken! 💰 Funds returned!",
    txFailed:    "Transaction failed 😢",
    noBalance:   "Piggy is empty — deposit first!",
    noMeta:      "Please install MetaMask!",
    connectFail: "Connection failed",
    needNetwork: "Switching to Arc Testnet...",
    goalSet:     (g) => `Goal set: ${g} USDC 🎯`,
    noGoal:      "Please enter a goal first!",
  },
  zh: {
    earlyTitle:      "小猪还没吃饱...",
    earlyBody:       "你还没完成30次存钱周期 🐷\n再坚持一下——小猪正在努力长大！",
    earlyCount:      (done, left) => `${done} / 30 次 — 还差 ${left} 次`,
    goalEarlyTitle:  "还没到终点...",
    goalEarlyBody:   "你还没达到存钱目标 🐷\n再坚持一下！",
    goalEarlyCount:  (pct) => `目前进度 ${pct}%`,
    depositing:  "正在存钱... 🐷",
    withdrawing: "正在打碎存钱罐...",
    depositOk:   (n) => `第 ${n} 次存钱成功！🎉`,
    rankUp:      (r) => `升级了：${r}！🎊`,
    withdrawOk:  "存钱罐已打碎！💰 资金已返回钱包！",
    txFailed:    "交易失败 😢",
    noBalance:   "存钱罐是空的，先存点钱吧！",
    noMeta:      "请先安装 MetaMask！",
    connectFail: "连接失败",
    needNetwork: "正在切换到 Arc 测试网...",
    goalSet:     (g) => `目标已设置：${g} USDC 🎯`,
    noGoal:      "请先输入目标金额！",
  }
};

function t(key, ...args) {
  const val = T[currentLang][key];
  return typeof val === "function" ? val(...args) : val;
}

// ── Language ──────────────────────────────────────────────
function setLang(lang) {
  currentLang = lang;
  document.querySelectorAll(".lang-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("lang" + lang.toUpperCase()).classList.add("active");
  applyLang();
}

function applyLang() {
  document.querySelectorAll("[data-vi]").forEach(el => {
    el.textContent = el.getAttribute(`data-${currentLang}`) ?? el.getAttribute("data-en");
  });
  updateStats();
}

// ── Mode Toggle ───────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;

  document.getElementById("modeNormal").classList.toggle("active", mode === "normal");
  document.getElementById("modePurpose").classList.toggle("active", mode === "purpose");
  document.getElementById("normalProgress").classList.toggle("hidden", mode === "purpose");
  document.getElementById("purposeSection").classList.toggle("hidden", mode === "normal");

  if (mode === "purpose") renderGoalUI();
}

// ── Goal (Purpose Mode) ───────────────────────────────────
function setGoal() {
  const val = parseFloat(document.getElementById("goalInput").value);
  if (!val || val <= 0) { showToast(t("noGoal")); return; }
  purposeGoal = val;
  localStorage.setItem("pigsave_goal", val);
  showToast(t("goalSet", val));
  renderGoalUI();
  updateGoalProgress();
}

function resetGoal() {
  purposeGoal = 0;
  localStorage.removeItem("pigsave_goal");
  document.getElementById("goalInput").value = "";
  renderGoalUI();
}

function renderGoalUI() {
  const hasGoal = purposeGoal > 0;
  document.getElementById("goalSetup").classList.toggle("hidden", hasGoal);
  document.getElementById("goalProgress").classList.toggle("hidden", !hasGoal);
  if (hasGoal) updateGoalProgress();
}

function updateGoalProgress() {
  if (purposeGoal <= 0) return;
  const balanceUSD = Number(ethers.formatUnits(userData.balance, 18));
  const pct        = Math.min((balanceUSD / purposeGoal) * 100, 100);
  document.getElementById("goalFill").style.width = pct.toFixed(1) + "%";
  document.getElementById("goalPct").textContent  = pct.toFixed(0) + "%";
}

// ── Wallet Connection ─────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) { showToast(t("noMeta")); return; }
  try {
    await switchToArc();
    provider        = new ethers.BrowserProvider(window.ethereum);
    signer          = await provider.getSigner();
    userAddress     = await signer.getAddress();
    pigSaveContract = new ethers.Contract(CONTRACT_ADDRESS, PIGSAVE_ABI, signer);

    // Load saved goal
    const saved = localStorage.getItem("pigsave_goal");
    if (saved) purposeGoal = parseFloat(saved);

    document.getElementById("connectSection").classList.add("hidden");
    document.getElementById("appSection").classList.remove("hidden");
    document.getElementById("walletAddr").textContent =
      userAddress.slice(0, 6) + "..." + userAddress.slice(-4);

    await refreshData();
  } catch (err) {
    console.error(err);
    showToast(t("connectFail"));
  }
}

async function switchToArc() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(current, 16) === ARC_CHAIN_ID) return;
  showToast(t("needNetwork"));
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  } catch {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: ARC_CHAIN_HEX,
        chainName: "Arc Testnet",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: [ARC_RPC],
        blockExplorerUrls: ["https://testnet.arcscan.app"],
      }],
    });
  }
}

// ── Data Refresh ──────────────────────────────────────────
async function refreshData() {
  try {
    const [bal, cnt, last, streak] = await pigSaveContract.getUserData(userAddress);
    userData = { balance: bal, depositCount: cnt, lastDepositTime: last, streak };
    updateStats();
    setPigScale();
    if (currentMode === "purpose") updateGoalProgress();
  } catch (err) {
    console.error("refreshData:", err);
  }
}

function updateStats() {
  const count  = Number(userData.depositCount);
  const streak = Number(userData.streak);

  document.getElementById("depositCount").textContent = count;
  document.getElementById("streakCount").textContent  = streak;

  // Normal mode progress bar (toward 30)
  const pct = Math.min((count / 30) * 100, 100);
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressLabel").textContent = `${count} / 30`;

  // Rank badge
  const balUSD = Number(ethers.formatUnits(userData.balance, 18));
  const rank   = getRank(count, balUSD);
  const badge  = document.getElementById("rankBadge");
  badge.textContent = rank.label;
  badge.className   = "rank-badge " + rank.cls;
}

// ── Pig Visual ────────────────────────────────────────────
function setPigScale(state = "normal") {
  const pig    = document.getElementById("pigImg");
  const shadow = document.querySelector(".pig-shadow");

  const balanceUSD = Number(ethers.formatUnits(userData.balance, 18));
  const scale      = 1 + Math.min(balanceUSD / 1000, 1);

  pig.style.setProperty("--pig-scale", scale);
  pig.style.transform = `scale(${scale})`;
  shadow.style.width  = (80 + (scale - 1) * 80) + "px";

  const imgs = {
    normal:  "images/pig-normal.png",
    happy:   "images/pig-happy.png",
    sad:     "images/pig-sad.png",
    deposit: "images/pig-deposit.png",
  };
  pig.src = imgs[state] ?? imgs.normal;
}

function bouncePig() {
  const pig = document.getElementById("pigImg");
  pig.classList.remove("bounce");
  void pig.offsetWidth;
  pig.classList.add("bounce");
  pig.addEventListener("animationend", () => pig.classList.remove("bounce"), { once: true });
}

// ── Deposit ───────────────────────────────────────────────
async function deposit(usdcAmount) {
  if (!signer) return;
  const prevCount = Number(userData.depositCount);
  const amount    = ethers.parseUnits(usdcAmount.toString(), 18);

  setBusy(true);
  try {
    showToast(t("depositing"));
    setPigScale("deposit");

    const tx = await pigSaveContract.deposit({ value: amount });
    await tx.wait();

    await refreshData();
    bouncePig();
    setPigScale("happy");

    const newCount = Number(userData.depositCount);
    const newBalUSD = Number(ethers.formatUnits(userData.balance, 18));
    const prevRank  = getRank(prevCount, newBalUSD).label;
    const newRank   = getRank(newCount,  newBalUSD).label;

    // Show rank-up toast if rank changed
    if (newRank !== prevRank) {
      setTimeout(() => showToast(t("rankUp", newRank)), 1200);
    } else {
      showToast(t("depositOk", newCount));
    }

    setTimeout(() => setPigScale("normal"), 2200);
  } catch (err) {
    console.error(err);
    showToast(t("txFailed"));
    setPigScale("normal");
  } finally {
    setBusy(false);
  }
}

// ── Withdraw ──────────────────────────────────────────────
function tryWithdraw() {
  if (userData.balance === 0n) { showToast(t("noBalance")); return; }

  // Purpose mode: check if goal reached
  if (currentMode === "purpose") {
    const balanceUSD = Number(ethers.formatUnits(userData.balance, 18));
    const pct        = purposeGoal > 0 ? Math.floor((balanceUSD / purposeGoal) * 100) : 100;
    if (pct >= 100) {
      executeWithdraw();
    } else {
      document.getElementById("modalTitle").textContent = t("goalEarlyTitle");
      document.getElementById("modalBody").textContent  = t("goalEarlyBody");
      document.getElementById("modalCount").textContent = t("goalEarlyCount", pct);
      setPigScale("sad");
      document.getElementById("modal").classList.remove("hidden");
    }
    return;
  }

  const count = Number(userData.depositCount);
  if (count >= 30) {
    executeWithdraw();
  } else {
    const left = 30 - count;
    document.getElementById("modalTitle").textContent = t("earlyTitle");
    document.getElementById("modalBody").textContent  = t("earlyBody");
    document.getElementById("modalCount").textContent = t("earlyCount", count, left);
    setPigScale("sad");
    document.getElementById("modal").classList.remove("hidden");
  }
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  setPigScale("normal");
}

async function confirmWithdraw() {
  closeModal();
  await executeWithdraw();
}

async function executeWithdraw() {
  setBusy(true);
  try {
    showToast(t("withdrawing"));
    const tx = await pigSaveContract.withdraw();
    await tx.wait();

    userData = { balance: 0n, depositCount: 0n, lastDepositTime: 0n, streak: 0n };
    updateStats();
    setPigScale("happy");
    showToast(t("withdrawOk"));
    if (currentMode === "purpose") updateGoalProgress();
    setTimeout(() => setPigScale("normal"), 2500);
  } catch (err) {
    console.error(err);
    showToast(t("txFailed"));
    setPigScale("normal");
  } finally {
    setBusy(false);
  }
}

// ── UI Helpers ────────────────────────────────────────────
function setBusy(on) {
  document.querySelectorAll(".btn-deposit, .btn-break, .btn-break-anyway, .btn-keep")
    .forEach(b => b.disabled = on);
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function disconnectWallet() {
  provider = null; signer = null; userAddress = null; pigSaveContract = null;
  userData = { balance: 0n, depositCount: 0n, lastDepositTime: 0n, streak: 0n };
  document.getElementById("appSection").classList.add("hidden");
  document.getElementById("connectSection").classList.remove("hidden");
}

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged",    () => location.reload());
}
