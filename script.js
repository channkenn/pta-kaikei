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

    this.records = result.data; // [行番号, 日付, 項目, 内訳, 金額, 支払先, 備考]
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
    let amount = parseFloat(document.getElementById("input-amount").value);
    if (!item || isNaN(amount)) return alert("項目と金額は必須です");

    const expenseItems = [
      "備品・消耗品費",
      "お楽しみ会",
      "予備費",
      "卒園・進級記念品",
      "通信・交通費",
    ];
    amount = expenseItems.includes(item) ? -Math.abs(amount) : Math.abs(amount);

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
      (r) => filter === "ALL" || r[2] === filter
    );
    let total = 0;

    const html = filtered.map((r) => {
      const amt = Number(r[4]);
      total += amt;
      const displayAmt = Math.abs(amt).toLocaleString();

      const commonCols = `
            <td>${new Date(r[1]).toLocaleDateString("ja-JP", {
              month: "numeric",
              day: "numeric",
            })}</td>
            <td>${r[2]}</td>
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

    document.getElementById("print-title-item").innerText =
      filter === "ALL" ? "全項目" : filter;
    document.getElementById("print-total").innerText =
      Math.abs(total).toLocaleString() + "円";
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

  // ★追加：印刷用関数（ファイル名設定機能付き）
  printReport() {
    const filterSelect = document.getElementById("filter-item");
    const itemName = filterSelect.options[filterSelect.selectedIndex].text;
    const originalTitle = document.title;

    // PDFのファイル名になるタイトルを変更
    document.title = itemName;

    window.print();

    // 印刷後にタイトルを元に戻す
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  },
};
