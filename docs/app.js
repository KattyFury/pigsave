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

const LANG_CYCLE  = ["en", "vi", "zh"];
const LANG_LABELS = { en: "EN", vi: "VI", zh: "CN" };

let userData = {
  balance:      0n,
  depositCount: 0n,
  mode:         0,   // 1 = Normal, 2 = With Goal
  goalAmount:   0n,
  hasPig:       false
};

// ── Rank System ────────────────────────────────────────────
// Diamond fills 9-cell area at ×1.4; Piglet base = ~164 px
function getRank(balanceUSD) {
  if (balanceUSD >= 1000) return { cls: "rank-diamond-pig", label: "Diamond Pig", scale: 1.2, prefix: "c" };
  if (balanceUSD >= 100)  return { cls: "rank-golden-pig",  label: "Golden Pig",  scale: 1.1, prefix: "b" };
  return                         { cls: "rank-piglet",      label: "Piglet",      scale: 1.0, prefix: "a" };
}

// ── Translations ───────────────────────────────────────────
const T = {
  vi: {
    noGoalInput:    "Nhập số tiền mục tiêu trước nhé!",
    buying:         "Đang mua heo...",
    buyOk:          "Có heo rồi! Bắt đầu tiết kiệm thôi",
    depositing:     "Đang bỏ heo...",
    withdrawing:    "Đang đập heo...",
    depositOk:      (n) => `Bỏ heo lần ${n}!`,
    rankUp:         (r) => `Lên cấp: ${r}!`,
    withdrawOk:     "Đập heo thành công! Tiền về ví rồi!",
    txFailed:       "Giao dịch thất bại",
    noBalance:      "Heo đang rỗng, bỏ tiền vào trước nhé!",
    noMeta:         "Cài MetaMask để tiếp tục!",
    connectFail:    "Kết nối thất bại",
    needNetwork:    "Đang chuyển sang Arc Testnet...",
    // Normal mode early break
    earlyTitle:     "Heo chưa đủ no...",
    earlyBody:      "Bạn chưa bỏ heo đủ 30 lần.\nNếu đập sớm, 1 USDC mua heo sẽ không được hoàn lại. Hãy kiên trì thêm nhé!",
    earlyCount:     (done, left) => `${done} / 30 lần — còn ${left} lần nữa`,
    // Purpose mode early break
    goalEarlyTitle: "Chưa đến đích rồi...",
    goalEarlyBody:  "Bạn chưa đạt mục tiêu tiết kiệm.\nNếu đập sớm, 1 USDC mua heo sẽ không được hoàn lại. Hãy kiên trì thêm nhé!",
    goalEarlyCount: (pct) => `Hiện tại mới được ${pct}%`,
    // 30/30 success
    successTitle:   "Bạn đã làm được rồi!",
    successBody:    "Bỏ heo đủ 30 lần — bạn đã giữ kỷ luật tài chính trong ít nhất một tháng.\n1 USDC mua heo sẽ được hoàn trả cùng toàn bộ số tiền đã để dành.",
    successCount:   (n) => `Tổng cộng ${n} lần bỏ heo`,
    // Purpose mode success
    goalSuccessTitle: "Mục tiêu đạt được!",
    goalSuccessBody:  "Bạn đã tiết kiệm đủ số tiền mục tiêu!\n1 USDC mua heo sẽ được hoàn trả cùng toàn bộ số tiền đã để dành.",
    goalSuccessCount: (pct) => `Đã đạt ${pct}% mục tiêu`,
  },
  en: {
    noGoalInput:    "Please enter your saving goal first!",
    buying:         "Buying your pig...",
    buyOk:          "Pig acquired! Start saving",
    depositing:     "Saving to piggy...",
    withdrawing:    "Breaking piggy bank...",
    depositOk:      (n) => `Save #${n} done!`,
    rankUp:         (r) => `Rank up: ${r}!`,
    withdrawOk:     "Piggy broken! Funds returned to wallet!",
    txFailed:       "Transaction failed",
    noBalance:      "Piggy is empty — deposit first!",
    noMeta:         "Please install MetaMask!",
    connectFail:    "Connection failed",
    needNetwork:    "Switching to Arc Testnet...",
    earlyTitle:     "Your piggy isn't full yet...",
    earlyBody:      "You haven't saved 30 times yet.\nBreaking early means you won't get your 1 USDC pig fee back. Stay strong!",
    earlyCount:     (done, left) => `${done} / 30 saves — ${left} more to go`,
    goalEarlyTitle: "Not at your goal yet...",
    goalEarlyBody:  "You haven't reached your saving goal yet.\nBreaking early means you won't get your 1 USDC pig fee back. Stay strong!",
    goalEarlyCount: (pct) => `Current progress: ${pct}%`,
    successTitle:   "You earned it!",
    successBody:    "30 saves complete — you stayed disciplined for at least a month.\nYour 1 USDC pig fee will be refunded together with all your savings.",
    successCount:   (n) => `Total saves: ${n}`,
    goalSuccessTitle: "Goal reached!",
    goalSuccessBody:  "You hit your saving target!\nYour 1 USDC pig fee will be refunded together with all your savings.",
    goalSuccessCount: (pct) => `Reached ${pct}% of goal`,
  },
  zh: {
    noGoalInput:    "请先输入目标金额！",
    buying:         "购买小猪中...",
    buyOk:          "小猪到手！开始存钱吧",
    depositing:     "正在存钱...",
    withdrawing:    "正在打碎存钱罐...",
    depositOk:      (n) => `第 ${n} 次存钱成功！`,
    rankUp:         (r) => `升级了：${r}！`,
    withdrawOk:     "存钱罐已打碎！资金已返回钱包！",
    txFailed:       "交易失败",
    noBalance:      "存钱罐是空的，先存点钱吧！",
    noMeta:         "请先安装 MetaMask！",
    connectFail:    "连接失败",
    needNetwork:    "正在切换到 Arc 测试网...",
    earlyTitle:     "小猪还没吃饱...",
    earlyBody:      "你还没存30次。\n提前打碎将无法退回1 USDC购买费。再坚持一下！",
    earlyCount:     (done, left) => `${done} / 30 次 — 还差 ${left} 次`,
    goalEarlyTitle: "还没到终点...",
    goalEarlyBody:  "你还没达到存钱目标。\n提前打碎将无法退回1 USDC购买费。再坚持一下！",
    goalEarlyCount: (pct) => `目前进度 ${pct}%`,
    successTitle:   "你做到了！",
    successBody:    "存满30次——你坚持了至少一个月的财务纪律。\n1 USDC购买费将连同全部存款一起退还。",
    successCount:   (n) => `共存钱 ${n} 次`,
    goalSuccessTitle: "目标达成！",
    goalSuccessBody:  "你已达到存钱目标！\n1 USDC购买费将连同全部存款一起退还。",
    goalSuccessCount: (pct) => `已达成目标的 ${pct}%`,
  }
};

function t(key, ...args) {
  const val = T[currentLang][key];
  return typeof val === "function" ? val(...args) : val;
}

// ── Language ───────────────────────────────────────────────
function toggleLangMenu() {
  document.querySelectorAll(".lang-selector").forEach(s => s.classList.toggle("open"));
}

function pickLang(lang) {
  // close all menus
  document.querySelectorAll(".lang-selector").forEach(s => s.classList.remove("open"));
  setLang(lang);
}

function setLang(lang) {
  currentLang = lang;
  // update pill label
  document.querySelectorAll(".lang-pill").forEach(btn => {
    btn.textContent = LANG_LABELS[lang];
  });
  // update active option highlight in all dropdowns
  document.querySelectorAll(".lang-option").forEach(opt => {
    opt.classList.toggle("active", opt.getAttribute("onclick") === `pickLang('${lang}')`);
  });
  applyLang();
}

// close dropdown when clicking outside
document.addEventListener("click", e => {
  if (!e.target.closest(".lang-selector")) {
    document.querySelectorAll(".lang-selector").forEach(s => s.classList.remove("open"));
  }
});

function applyLang() {
  document.querySelectorAll("[data-vi]").forEach(el => {
    el.innerHTML = el.getAttribute(`data-${currentLang}`) ?? el.getAttribute("data-en");
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
const MODE_DESC = {
  normal:  { vi: "Bỏ heo ít nhất 30 lần → lấy lại 1 USDC",
             en: "Save at least 30 times → get your 1 USDC back",
             zh: "至少存30次 → 退回1 USDC" },
  purpose: { vi: "Đạt mục tiêu tiết kiệm → lấy lại 1 USDC",
             en: "Reach your saving goal → get your 1 USDC back",
             zh: "达成目标 → 退回1 USDC" }
};

function selectMode(mode) {
  selectedMode = mode;
  document.getElementById("selectNormal").classList.toggle("active",  mode === "normal");
  document.getElementById("selectPurpose").classList.toggle("active", mode === "purpose");
  document.getElementById("goalInputWrap").classList.toggle("hidden", mode !== "purpose");

  // Swap desc text in-place — no element appears/disappears, no layout jump
  const desc = document.getElementById("modeDesc");
  const texts = MODE_DESC[mode];
  desc.setAttribute("data-vi", texts.vi);
  desc.setAttribute("data-en", texts.en);
  desc.setAttribute("data-zh", texts.zh);
  desc.textContent = texts[currentLang] ?? texts.en;
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
// skipPigReset = true when called mid-animation (deposit flow)
async function refreshData(skipPigReset = false) {
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

    if (!skipPigReset) {
      // Grow pig smoothly from scale 0 when first landing on app screen
      document.getElementById("pigScale").style.transform = "scale(0)";
      requestAnimationFrame(() => setPigVisual("normal"));
    }
  } catch (err) {
    console.error("refreshData error:", err);
  }
}

function updateStats() {
  if (!userData.hasPig) return;

  const count  = Number(userData.depositCount);
  const balUSD = Number(ethers.formatUnits(userData.balance, 18));
  const rank   = getRank(balUSD);

  // Deposit count (always shown, keeps climbing)
  document.getElementById("depositCount").textContent = count;

  // Rank badge
  const badge = document.getElementById("rankBadge");
  badge.textContent = rank.label;
  badge.className   = "a-rank " + rank.cls;

  // Progress bars
  if (userData.mode === 1) {
    // Normal: show progress bar only until 30 saves; hide once complete
    const done = count >= 30;
    document.getElementById("normalProgress").classList.toggle("hidden", done);
    if (!done) {
      const pct = Math.min((count / 30) * 100, 100);
      document.getElementById("progressFill").style.width  = pct + "%";
      document.getElementById("progressLabel").textContent = `${count} / 30`;
    }
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

  const stateNum = { normal: 1, sad: 2, happy: 3, deposit: 4 };
  const newSrc = `images/${rank.prefix}${stateNum[state] ?? 1}.png`;

  // Only swap src if image actually changes — fade out → load → fade in
  if (!pig.src.endsWith(newSrc)) {
    pig.style.opacity = "0";
    pig.onload = () => { pig.style.opacity = "1"; pig.onload = null; };
    pig.src = newSrc;
  }
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
    setPigVisual("deposit");          // step 1: deposit animation

    const tx = await pigSaveContract.deposit({ value: amount });
    await tx.wait();

    // skipPigReset=true so refreshData doesn't clobber our animation
    await refreshData(true);

    bouncePig();
    setPigVisual("happy");            // step 2: happy after tx confirmed

    const newBalUSD = Number(ethers.formatUnits(userData.balance, 18));
    const newRank   = getRank(newBalUSD).label;
    const newCount  = Number(userData.depositCount);

    if (newRank !== prevRank) {
      setTimeout(() => showToast(t("rankUp", newRank)), 1200);
    } else {
      showToast(t("depositOk", newCount));
    }

    setTimeout(() => setPigVisual("normal"), 2200); // step 3: back to normal
  } catch (err) {
    console.error(err);
    showToast(t("txFailed"));
    setPigVisual("normal");
  } finally {
    setBusy(false);
  }
}

// ── Withdraw ───────────────────────────────────────────────
function showModal(isSuccess) {
  const modal = document.getElementById("modal");
  modal.classList.remove("hidden");
  modal.classList.toggle("success", isSuccess);
}

function tryWithdraw() {
  if (userData.balance === 0n) { showToast(t("noBalance")); return; }

  if (userData.mode === 1) {
    // Normal mode
    const count = Number(userData.depositCount);
    if (count >= 30) {
      // Success: pig is happy, congrats modal
      setPigVisual("happy");
      document.getElementById("modalTitle").textContent = t("successTitle");
      document.getElementById("modalBody").textContent  = t("successBody");
      document.getElementById("modalCount").textContent = t("successCount", count);
      showModal(true);
    } else {
      // Early break: pig is sad, warning modal
      const left = 30 - count;
      setPigVisual("sad");
      document.getElementById("modalTitle").textContent = t("earlyTitle");
      document.getElementById("modalBody").textContent  = t("earlyBody");
      document.getElementById("modalCount").textContent = t("earlyCount", count, left);
      showModal(false);
    }
  } else {
    // With Goal mode
    const balUSD  = Number(ethers.formatUnits(userData.balance, 18));
    const goalUSD = Number(ethers.formatUnits(userData.goalAmount, 18));
    const pct     = goalUSD > 0 ? Math.floor((balUSD / goalUSD) * 100) : 100;
    if (pct >= 100) {
      // Goal reached: happy pig, congrats
      setPigVisual("happy");
      document.getElementById("modalTitle").textContent = t("goalSuccessTitle");
      document.getElementById("modalBody").textContent  = t("goalSuccessBody");
      document.getElementById("modalCount").textContent = t("goalSuccessCount", pct);
      showModal(true);
    } else {
      // Early break: sad pig, warning
      setPigVisual("sad");
      document.getElementById("modalTitle").textContent = t("goalEarlyTitle");
      document.getElementById("modalBody").textContent  = t("goalEarlyBody");
      document.getElementById("modalCount").textContent = t("goalEarlyCount", pct);
      showModal(false);
    }
  }
}

function closeModal() {
  const modal = document.getElementById("modal");
  const isSuccess = modal.classList.contains("success");
  modal.classList.add("hidden");
  modal.classList.remove("success");
  // Only reset pig to normal if we're closing a warning (early break)
  // For success, keep pig happy until user navigates away
  if (!isSuccess) setPigVisual("normal");
}

async function confirmWithdraw() {
  // Close overlay only — do NOT reset pig visual.
  // Pig stays sad (early break) or happy (success) through the whole tx.
  const modal = document.getElementById("modal");
  modal.classList.add("hidden");
  modal.classList.remove("success");
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
    ".btn-deposit, .btn-break, .btn-break-modal, .btn-keep, .c-btn"
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
  // Preload all 12 pig images so every state transition is instant (no flicker)
  ['a','b','c'].forEach(p => [1,2,3,4].forEach(s => { new Image().src = `images/${p}${s}.png`; }));

  setLang("en");
  if (window.ethereum) {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) await initApp();
  }
});
