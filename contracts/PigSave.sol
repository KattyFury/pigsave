// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PigSave {

    // ── Constants ──────────────────────────────────────────
    address public constant TREASURY  = 0xb0ea48A1979326BA9e0b5027D105C8DF9CCAA12E;
    uint256 public constant PIG_PRICE = 1e18; // 1 USDC (18 decimals, native token on Arc)

    // ── Reentrancy Guard ───────────────────────────────────
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "Reentrant call");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ── Storage ────────────────────────────────────────────
    struct UserData {
        uint256 balance;       // savings balance (wei)
        uint256 depositCount;
        uint8   mode;          // 1 = Normal, 2 = With Goal
        uint256 goalAmount;    // savings target for With Goal mode (wei)
        bool    hasPig;
    }

    mapping(address => UserData) private users;

    // ── Events ─────────────────────────────────────────────
    event PigBought(address indexed user, uint8 mode, uint256 goalAmount);
    event Deposited(address indexed user, uint256 amount, uint256 depositCount);
    event Withdrawn(address indexed user, uint256 amount, bool refunded);

    // ── Reject accidental sends ────────────────────────────
    receive() external payable { revert("Use buyPig() or deposit()"); }

    // ── Buy Pig ────────────────────────────────────────────
    // Costs exactly 1 USDC. That 1 USDC is refunded if the user
    // meets their goal; otherwise it goes to the treasury.
    // mode 1 = Normal  (refund after 30 deposits)
    // mode 2 = With Goal (refund when balance >= goalAmount)
    function buyPig(uint8 mode, uint256 goalAmount) external payable nonReentrant {
        require(!users[msg.sender].hasPig,     "Already have a pig");
        require(msg.value == PIG_PRICE,         "Send exactly 1 USDC");
        require(mode == 1 || mode == 2,         "Invalid mode");
        if (mode == 2) require(goalAmount > 0,  "Goal must be > 0");

        UserData storage u = users[msg.sender];
        u.hasPig       = true;
        u.mode         = mode;
        u.goalAmount   = (mode == 2) ? goalAmount : 0;
        u.balance      = 0;
        u.depositCount = 0;

        emit PigBought(msg.sender, mode, goalAmount);
    }

    // ── Deposit ────────────────────────────────────────────
    function deposit() external payable nonReentrant {
        require(msg.value > 0, "Amount must be > 0");
        UserData storage u = users[msg.sender];
        require(u.hasPig, "Buy a pig first");

        u.balance      += msg.value;
        u.depositCount += 1;

        emit Deposited(msg.sender, msg.value, u.depositCount);
    }

    // ── Withdraw (Break Piggy Bank) ────────────────────────
    // Sends savings to user. Then:
    //   Goal met  → 1 USDC pig fee refunded to user
    //   Early out → 1 USDC pig fee sent to treasury
    function withdraw() external nonReentrant {
        UserData storage u = users[msg.sender];
        require(u.hasPig,   "No pig to break");
        uint256 amount = u.balance;
        require(amount > 0, "Nothing to withdraw");

        // Evaluate refund BEFORE clearing state
        bool refund;
        if (u.mode == 1) {
            refund = (u.depositCount >= 30);
        } else {
            refund = (u.balance >= u.goalAmount);
        }

        // Clear state first (Checks-Effects-Interactions pattern)
        u.balance      = 0;
        u.depositCount = 0;
        u.hasPig       = false;
        u.mode         = 0;
        u.goalAmount   = 0;

        // Send savings to user
        (bool ok1, ) = payable(msg.sender).call{value: amount}("");
        require(ok1, "Savings transfer failed");

        // Pig deposit: refund or send to treasury
        if (refund) {
            (bool ok2, ) = payable(msg.sender).call{value: PIG_PRICE}("");
            require(ok2, "Refund failed");
        } else {
            (bool ok3, ) = payable(TREASURY).call{value: PIG_PRICE}("");
            require(ok3, "Treasury transfer failed");
        }

        emit Withdrawn(msg.sender, amount, refund);
    }

    // ── View ───────────────────────────────────────────────
    function getUserData(address addr) external view returns (
        uint256 balance,
        uint256 depositCount,
        uint8   mode,
        uint256 goalAmount,
        bool    hasPig
    ) {
        UserData storage u = users[addr];
        return (u.balance, u.depositCount, u.mode, u.goalAmount, u.hasPig);
    }
}
