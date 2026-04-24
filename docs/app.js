// ── Network Config ─────────────────────────────────────────
const ARC_CHAIN_ID  = 5042002;
const ARC_CHAIN_HEX = "0x" + ARC_CHAIN_ID.toString(16);
const ARC_RPC       = "https://5042002.rpc.thirdweb.com";

// ⚠️  Paste your NEW contract address here after redeploying PigSave.sol
const CONTRACT_ADDRESS = "0x23A698adB00f7807E48a8df772535493707dE720";

const PIGSAVE_ABI = [
  "function buyPig(uint8 mode, uint256 goalAmount) external payable",
  "function deposit() external payable",
  "function withdraw() external",
  "function getUserData(address addr) external view returns (uint256 balance, uint256 depositCount, uint8 mode, uint256 goalAmount, bool hasPig)"
];

// ── App State ──────────────────────────────────────────────
let provider, signer, userAddress;
let pigSaveContract;
let currentLang  = "en";
let selectedMode = "normal"; // chosen on the buy screen

let userData = {
  balance:      0n,
  depositCount: 0n,
  mode:         0,   // 1 = Normal, 2 = With Goal
  goalAmount:   0n,
  hasPig:       false
};

// ── Rank System (3 tiers, balance-based, no icon in label) ─
function getRank(balanceUSD) {
  if (balanceUSD >= 1000) return { cls: "rank-diamond-pig", label: "Diamond Pig", scale: 2.0 };
  if (balanceUSD  >= 100) return { cls: "rank-golden-pig",  label: "Golden Pig",  scale: 1.3 };
  return                         { cls: "rank-piglet",      label: "Piglet",      scale: 1.0 };
}

// ── Translations ───────────────────────────────────────────
const T = {
  vi: {
    noGoalInput:    "Nhập số tiền mục tiêu trước nhé!",
    buying:         "Đang mua heo... 🐷",
    buyOk:          "Có heo rồi! Bắt đầu tiết kiệm thôi 🎉",
    depositing:     "Đang bỏ heo... 🐷",
    withdrawing:    "Đang đập heo...",
    depositOk:      (n) => `Bỏ heo lần ${n}! 🎉`,
    rankUp:         (r) => `Lên cấp: ${r}! 🎊`,
    withdrawOk:     "Đập heo thành công! 💰 Tiền về ví rồi!",
    txFailed:       "Giao dịch thất bại 😢",
    noBalance:      "Heo đang rỗng, bỏ tiền vào trước nhé!",
    noMeta:         "Cài MetaMask để tiếp tục!",
    connectFail:    "Kết nối thất bại",
    needNetwork:    "Đang chuyển sang Arc Testnet...",
    // Normal mode early break
    earlyTitle:     "Heo chưa đủ no...",
    earlyBody:      "Chưa đủ 30 lần bỏ heo.\n⚠️ Đập sớm sẽ mất 1 USDC tiền mua heo!",
    earlyCount:     (done, left) => `${done} / 30 lần — còn ${left} lần nữa`,
    // Purpose mode early break
    goalEarlyTitle: "Chưa đến đích rồi...",
    goalEarlyBody:  "Chưa đạt mục tiêu tiết kiệm.\n⚠️ Đập sớm sẽ mất 1 USDC tiền mua heo!",
    goalEarlyCount: (pct) => `Hiện tại mới được ${pct}%`,
  },
  en: {
    noGoalInput:    "Please enter your saving goal first!",
    buying:         "Buying your pig... 🐷",
    buyOk:          "Pig acquired! Start saving 🎉",
    depositing:     "Saving to piggy... 🐷",
    withdrawing:    "Breaking piggy bank...",
    depositOk:      (n) => `Save #${n} done! 🎉`,
    rankUp:         (r) => `Rank up: ${r}! 🎊`,
    withdrawOk:     "Piggy broken! 💰 Funds returned to wallet!",
    txFailed:       "Transaction failed 😢",
    noBalance:      "Piggy is empty — deposit first!",
    noMeta:         "Please install MetaMask!",
    connectFail:    "Connection failed",
    needNetwork:    "Switching to Arc Testnet...",
    earlyTitle:     "Piggy isn't full yet...",
    earlyBody:      "You haven't saved 30 times yet.\n⚠️ Breaking early will forfeit your 1 USDC pig fee!",
    earlyCount:     (done, left) => `${done} / 30 saves — ${left} more to go`,
    goalEarlyTitle: "Not at your goal yet...",
    goalEarlyBody:  "You haven't reached your saving goal.\n⚠️ Breaking early will forfeit your 1 USDC pig fee!",
    goalEarlyCount: (pct) => `Current progress: ${pct}%`,
  },
  zh: {
    noGoalInput:    "请先输入目标金额！",
    buying:         "购买小猪中... 🐷",
    buyOk:          "小猪到手！开始存钱吧 🎉",
    depositing:     "正在存钱... 🐷",
    withdrawing:    "正在打碎存钱罐...",
    depositOk:      (n) => `第 ${n} 次存钱成功！🎉`,
    rankUp:         (r) => `升级了：${r}！🎊`,
    withdrawOk:     "存钱罐已打碎！💰 资金已返回钱包！",
    txFailed:       "交易失败 😢",
    noBalance:      "存钱罐是空的，先存点钱吧！",
    noMeta:         "请先安装 MetaMask！",
    connectFail:    "连接失败",
    needNetwork:    "正在切换到 Arc 测试网...",
    earlyTitle:     "小猪还没吃饱...",
    earlyBody:      "你还没存30次。\n⚠️ 提前打碎将损失1 USDC购买费！",
    earlyCount:     (done, left) => `${done} / 30 次 — 还差 ${left} 次`,
    goalEarlyTitle: "还没到终点...",
    goalEarlyBody:  "你还没达到存钱目标。\n⚠️ 提前打碎将损失1 USDC购买费！",
    goalEarlyCount: (pct) => `目前进度 ${pct}%`,
  }
};

function t(key, ...args) {
  const val = T[currentLang][key];
  return typeof val === "function" ? val(...args) : val;
}

// ── Language ───────────────────────────────────────────────
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
  if (userData.hasPig) updateStats();
}

// ── Screen management ──────────────────────────────────────
function showScreen(id) {
  ["connectSection", "buySection", "appSection"].forEach(s =>
    document.getElementById(s).classList.toggle("hidden", s !== id)
  );
}

// ── Mode selection (on buy screen) ────────────────────────
function selectMode(mode) {
  selectedMode = mode;
  document.getElementById("selectNormal").classList.toggle("active",  mode === "normal");
  document.getElementById("selectPurpose").classList.toggle("active", mode === "purpose");
  document.getElementById("modeDescNormal").classList.toggle("hidden",  mode !== "normal");
  document.getElementById("modeDescPurpose").classList.toggle("hidden", mode !== "purpose");
  document.getElementById("goalInputWrap").classList.toggle("hidden",   mode !== "purpose");
}

// ── Wallet connection ──────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) { showToast(t("noMeta")); return; }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await initApp();
  } catch (err) {
    console.error(err);
    showToast(t("connectFail"));
  }
}

async function initApp() {
  provider        = new ethers.BrowserProvider(window.ethereum);
  signer          = await provider.getSigner();
  userAddress     = await signer.getAddress();
  pigSaveContract = new ethers.Contract(CONTRACT_ADDRESS, PIGSAVE_ABI, signer);

  const addrShort = userAddress.slice(0,6) + "..." + userAddress.slice(-4);
  document.getElementById("walletAddr").textContent    = addrShort;
  document.getElementById("buyWalletAddr").textContent = addrShort;

  // Check/switch network
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(chainId, 16) !== ARC_CHAIN_ID) {
    showToast(t("needNetwork"));
    await switchToArc();
  }

  await refreshData();
}

async function switchToArc() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  } catch {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId:            ARC_CHAIN_HEX,
        chainName:          "Arc Testnet",
        nativeCurrency:     { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls:            [ARC_RPC],
        blockExplorerUrls:  ["https://testnet.arcscan.app"],
      }],
    });
  }
}

async function disconnectWallet() {
  try {
    await window.ethereum.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (_) {}
  provider = null; signer = null; userAddress = null; pigSaveContract = null;
  userData = { balance: 0n, depositCount: 0n, mode: 0, goalAmount: 0n, hasPig: false };
  showScreen("connectSection");
}

// ── Data refresh ───────────────────────────────────────────
async function refreshData() {
  try {
    const [bal, cnt, mode, goal, hasPig] = await pigSaveContract.getUserData(userAddress);
    userData = { balance: bal, depositCount: cnt, mode: Number(mode), goalAmount: goal, hasPig };

    if (!hasPig) {
      showScreen("buySection");
      return;
    }

    showScreen("appSection");

    // Show the correct progress bar based on locked mode
    const isNormal = userData.mode === 1;
    document.getElementById("normalProgress").classList.toggle("hidden",  !isNormal);
    document.getElementById("purposeProgress").classList.toggle("hidden",  isNormal);

    updateStats();
    setPigVisual("normal");
  } catch (err) {
    console.error("refreshData error:", err);
  }
}

function updateStats() {
  if (!userData.hasPig) return;

  const count  = Number(userData.depositCount);
  const balUSD = Number(ethers.formatUnits(userData.balance, 18));
  const rank   = getRank(balUSD);

  // Deposit count
  document.getElementById("depositCount").textContent = count;

  // Rank badge
  const badge     = document.getElementById("rankBadge");
  badge.textContent = rank.label;
  badge.className   = "rank-badge " + rank.cls;

  // Progress bars
  if (userData.mode === 1) {
    // Normal: how many of 30 deposits done
    const pct = Math.min((count / 30) * 100, 100);
    document.getElementById("progressFill").style.width  = pct + "%";
    document.getElementById("progressLabel").textContent = `${count} / 30`;
  } else {
    // Purpose: how close to goal
    const goalUSD = Number(ethers.formatUnits(userData.goalAmount, 18));
    const pct     = goalUSD > 0 ? Math.min((balUSD / goalUSD) * 100, 100) : 0;
    document.getElementById("goalFill").style.width = pct.toFixed(1) + "%";
    document.getElementById("goalPct").textContent  =
      pct.toFixed(0) + "% of $" + goalUSD.toLocaleString();
  }
}

// ── Pig visuals ────────────────────────────────────────────
// pigScale div  → rank-based scale (layout unchanged, visually larger)
// pigImg        → image swap + bounce animation
function setPigVisual(state = "normal") {
  const pigScale = document.getElementById("pigScale");
  const pig      = document.getElementById("pigImg");
  const balUSD   = Number(ethers.formatUnits(userData.balance, 18));
  const rank     = getRank(balUSD);

  pigScale.style.transform = `scale(${rank.scale})`;

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
  void pig.offsetWidth; // force reflow
  pig.classList.add("bounce");
  pig.addEventListener("animationend", () => pig.classList.remove("bounce"), { once: true });
}

// ── Buy Pig ────────────────────────────────────────────────
async function buyPigAction() {
  if (!signer) return;

  const mode = (selectedMode === "normal") ? 1 : 2;
  let goalAmount = 0n;

  if (mode === 2) {
    const goalVal = parseFloat(document.getElementById("goalInput").value);
    if (!goalVal || goalVal <= 0) { showToast(t("noGoalInput")); return; }
    goalAmount = ethers.parseUnits(goalVal.toString(), 18);
  }

  setBusy(true);
  try {
    showToast(t("buying"));
    const pigPrice = ethers.parseUnits("1", 18); // 1 USDC
    const tx = await pigSaveContract.buyPig(mode, goalAmount, { value: pigPrice });
    await tx.wait();
    showToast(t("buyOk"));
    await refreshData(); // will switch to appSection
  } catch (err) {
    console.error(err);
    showToast(t("txFailed"));
  } finally {
    setBusy(false);
  }
}

// ── Deposit ────────────────────────────────────────────────
async function deposit(usdcAmount) {
  if (!signer) return;

  const prevBalUSD = Number(ethers.formatUnits(userData.balance, 18));
  const prevRank   = getRank(prevBalUSD).label;
  const amount     = ethers.parseUnits(usdcAmount.toString(), 18);

  setBusy(true);
  try {
    showToast(t("depositing"));
    setPigVisual("deposit");

    const tx = await pigSaveContract.deposit({ value: amount });
    await tx.wait();

    await refreshData();
    bouncePig();
    setPigVisual("happy");

    const newBalUSD = Number(ethers.formatUnits(userData.balance, 18));
    const newRank   = getRank(newBalUSD).label;
    const newCount  = Number(userData.depositCount);

    if (newRank !== prevRank) {
      setTimeout(() => showToast(t("rankUp", newRank)), 1200);
    } else {
      showToast(t("depositOk", newCount));
    }

    setTimeout(() => setPigVisual("normal"), 2200);
  } catch (err) {
    console.error(err);
    showToast(t("txFailed"));
    setPigVisual("normal");
  } finally {
    setBusy(false);
  }
}

// ── Withdraw ───────────────────────────────────────────────
function tryWithdraw() {
  if (userData.balance === 0n) { showToast(t("noBalance")); return; }

  if (userData.mode === 1) {
    // Normal mode
    const count = Number(userData.depositCount);
    if (count >= 30) {
      executeWithdraw();
    } else {
      const left = 30 - count;
      document.getElementById("modalTitle").textContent = t("earlyTitle");
      document.getElementById("modalBody").textContent  = t("earlyBody");
      document.getElementById("modalCount").textContent = t("earlyCount", count, left);
      setPigVisual("sad");
      document.getElementById("modal").classList.remove("hidden");
    }
  } else {
    // With Goal mode
    const balUSD  = Number(ethers.formatUnits(userData.balance, 18));
    const goalUSD = Number(ethers.formatUnits(userData.goalAmount, 18));
    const pct     = goalUSD > 0 ? Math.floor((balUSD / goalUSD) * 100) : 100;
    if (pct >= 100) {
      executeWithdraw();
    } else {
      document.getElementById("modalTitle").textContent = t("goalEarlyTitle");
      document.getElementById("modalBody").textContent  = t("goalEarlyBody");
      document.getElementById("modalCount").textContent = t("goalEarlyCount", pct);
      setPigVisual("sad");
      document.getElementById("modal").classList.remove("hidden");
    }
  }
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  setPigVisual("normal");
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

    // Reset local state and go back to buy pig screen
    userData = { balance: 0n, depositCount: 0n, mode: 0, goalAmount: 0n, hasPig: false };
    showToast(t("withdrawOk"));
    showScreen("buySection");

    // Reset buy screen to default state
    selectMode("normal");
    document.getElementById("goalInput").value = "";
  } catch (err) {
    console.error(err);
    showToast(t("txFailed"));
    setPigVisual("normal");
  } finally {
    setBusy(false);
  }
}

// ── UI helpers ─────────────────────────────────────────────
function setBusy(on) {
  document.querySelectorAll(
    ".btn-deposit, .btn-break, .btn-break-anyway, .btn-keep, .btn-buy"
  ).forEach(b => b.disabled = on);
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// ── MetaMask event listeners ───────────────────────────────
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged",    () => location.reload());
}

// ── On page load: apply language + auto-reconnect ─────────
document.addEventListener("DOMContentLoaded", async () => {
  setLang("en");
  if (window.ethereum) {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) await initApp();
  }
});
