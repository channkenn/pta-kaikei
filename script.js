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
    const viewBody = document.getElementById("view-body");
    const printBody = document.getElementById("report-body");

    const filtered = this.records.filter(
      (r) => filter === "ALL" || r[2] === filter,
    );

    let incomeTotal = 0;
    let expenseTotal = 0;

    // 収入とみなす項目リスト
    const incomeItems = [
      "前年度繰越金",
      "本年度会費",
      "資源回収収益",
      "決算利息",
    ];

    const html = filtered.map((r) => {
      const itemName = r[2];
      const amt = Number(r[4]);

      // 収入か支出かを判定して加算
      if (incomeItems.includes(itemName)) {
        incomeTotal += amt;
      } else {
        expenseTotal += amt;
      }

      const displayAmt = amt.toLocaleString();
      const commonCols = `
            <td>${new Date(r[1]).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</td>
            <td>${itemName}</td>
            <td>${r[3]}</td>
            <td style="text-align:right">${displayAmt}</td>
            <td>${r[5] || ""}</td>
            <td>${r[6] || ""}</td>
        `;

      return {
        print: `<tr>${commonCols}</tr>`,
        view: `<tr>${commonCols}<td><button onclick="app.deleteRecord(${r[0]})" class="btn-delete">削</button></td></tr>`,
      };
    });

    viewBody.innerHTML = html.map((h) => h.view).join("");
    printBody.innerHTML = html.map((h) => h.print).join("");

    // 各合計と残高の計算
    const balance = incomeTotal - expenseTotal;

    // 画面表示更新
    document.getElementById("view-total-income").innerText =
      incomeTotal.toLocaleString();
    document.getElementById("view-total-expense").innerText =
      expenseTotal.toLocaleString();
    document.getElementById("view-total-balance").innerText =
      balance.toLocaleString();

    // 帳票用（印刷用）のテキスト
    document.getElementById("print-title-item").innerText =
      filter === "ALL" ? "全項目" : filter;
    document.getElementById("print-total").innerText =
      `収入: ${incomeTotal.toLocaleString()}円 / 支出: ${expenseTotal.toLocaleString()}円 (残高: ${balance.toLocaleString()}円)`;
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
