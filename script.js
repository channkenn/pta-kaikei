const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzT6TAja9-u1ShiuioVlvxLZSoQxMUCpSR5tTSHDfnDCnjHqhmc7VWZbdojP7b3uFJIMw/exec";

const app = {
  userPass: "",
  selectedYear: "",
  records: [],
  editable: false,

  async login() {
    this.userPass = document.getElementById("passcode").value;
    this.selectedYear = document.getElementById("select-year").value;
    if (!this.userPass) return alert("合言葉を入力してください");

    const result = await this.fetchFromGAS({ action: "read" });
    if (result.error) return alert(result.error);

    this.records = result.data;
    this.editable = result.editable;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-screen").style.display = "block";
    document.getElementById("display-year").innerText =
      this.selectedYear + "年度 収支入力";
    this.renderTable();
  },

  async fetchFromGAS(body) {
    body.passcode = this.userPass;
    body.year = this.selectedYear;
    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return await response.json();
    } catch (e) {
      return { error: "通信に失敗しました" };
    }
  },

  async saveData() {
    const item = document.getElementById("input-item").value;
    let amount = Math.abs(
      parseFloat(document.getElementById("input-amount").value),
    );
    if (!item || isNaN(amount)) return alert("項目と金額は必須です");

    const result = await this.fetchFromGAS({
      action: "write",
      date: document.getElementById("input-date").value,
      item: item,
      details: document.getElementById("input-details").value,
      amount: amount,
      payee: document.getElementById("input-payee").value,
      memo: document.getElementById("input-memo").value,
    });
    if (result.success) {
      alert("保存しました");
      this.resetForm();
      this.login();
    }
  },

  async deleteRecord(rowNum) {
    if (!confirm("この行を削除してもよろしいですか？")) return;
    const result = await this.fetchFromGAS({
      action: "delete",
      rowNum: rowNum,
    });
    if (result.success) this.login();
  },

  renderTable() {
    const filter = document.getElementById("filter-item").value;
    const sortOrder = document.getElementById("sort-order").value;
    const viewBody = document.getElementById("view-body");
    const printBody = document.getElementById("report-body");

    // 1. 絞り込み
    let filtered = this.records.filter(
      (r) => filter === "ALL" || r[2] === filter,
    );

    // 2. 日付ソート
    filtered.sort((a, b) => {
      const dateA = new Date(a[1]);
      const dateB = new Date(b[1]);
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    const incomeItems = [
      "前年度繰越金",
      "本年度会費",
      "資源回収収益",
      "決算利息",
    ];

    const html = filtered.map((r) => {
      const itemName = r[2];
      const amt = Number(r[4]);
      const isIncome = incomeItems.includes(itemName);
      const amtColor = isIncome ? "color: #0000ff;" : "color: #d32f2f;";

      // チェックボックス (金額と収入フラグを保持)
      const checkbox = `<input type="checkbox" class="row-checkbox" checked 
                          data-amount="${amt}" 
                          data-income="${isIncome}" 
                          onchange="app.recalculateSelected()">`;

      const commonCols = `
            <td>${new Date(r[1]).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</td>
            <td>${itemName}</td>
            <td>${r[3]}</td>
            <td style="text-align:right; font-weight:bold; ${amtColor}">${amt.toLocaleString()}</td>
            <td>${r[5] || ""}</td>
            <td>${r[6] || ""}</td>
        `;

      return {
        print: `<tr>${commonCols}</tr>`,
        view: `<tr><td>${checkbox}</td>${commonCols}<td><button onclick="app.deleteRecord(${r[0]})" class="btn-delete">削</button></td></tr>`,
      };
    });

    viewBody.innerHTML = html.map((h) => h.view).join("");
    printBody.innerHTML = html.map((h) => h.print).join("");

    // 集計実行
    this.recalculateSelected();
    document.getElementById("print-title-item").innerText =
      filter === "ALL" ? "全項目" : filter;
  },

  // ★チェックされた行だけで合計を出す
  recalculateSelected() {
    let incomeTotal = 0;
    let expenseTotal = 0;

    const checkboxes = document.querySelectorAll(".row-checkbox");
    checkboxes.forEach((cb) => {
      if (cb.checked) {
        const amt = parseFloat(cb.dataset.amount);
        const isIncome = cb.dataset.income === "true";
        if (isIncome) {
          incomeTotal += amt;
        } else {
          expenseTotal += amt;
        }
      }
    });

    const balance = incomeTotal - expenseTotal;

    const incomeEl = document.getElementById("view-total-income");
    const expenseEl = document.getElementById("view-total-expense");
    const balanceEl = document.getElementById("view-total-balance");

    if (incomeEl) {
      incomeEl.innerText = incomeTotal.toLocaleString();
      incomeEl.parentElement.style.color = "#0000ff"; // 収入は青
    }
    if (expenseEl) {
      expenseEl.innerText = expenseTotal.toLocaleString();
      expenseEl.parentElement.style.color = "#d32f2f"; // 支出は赤
    }
    if (balanceEl) balanceEl.innerText = balance.toLocaleString();

    // 帳票合計ラベル
    const printTotal = document.getElementById("print-total");
    if (printTotal) {
      printTotal.innerText = `選択計 収入: ${incomeTotal.toLocaleString()}円 / 支出: ${expenseTotal.toLocaleString()}円 (残高: ${balance.toLocaleString()}円)`;
    }
  },

  switchTab(tab) {
    document.getElementById("content-input").style.display =
      tab === "input" ? "block" : "none";
    document.getElementById("content-view").style.display =
      tab === "view" ? "block" : "none";
    document
      .getElementById("tab-input")
      .classList.toggle("active", tab === "input");
    document
      .getElementById("tab-view")
      .classList.toggle("active", tab === "view");
    if (tab === "view") this.renderTable();
  },

  resetForm() {
    [
      "input-item",
      "input-details",
      "input-amount",
      "input-payee",
      "input-memo",
    ].forEach((id) => {
      document.getElementById(id).value = "";
    });
    document.getElementById("input-date").value = new Date()
      .toISOString()
      .split("T")[0];
  },

  printReport() {
    const filterSelect = document.getElementById("filter-item");
    const itemName = filterSelect.options[filterSelect.selectedIndex].text;
    const originalTitle = document.title;
    document.title = itemName;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  },
};
