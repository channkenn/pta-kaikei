// --- 設定エリア ---
// あなたが発行したGASのWebアプリURLをここに貼り付けてください
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzT6TAja9-u1ShiuioVlvxLZSoQxMUCpSR5tTSHDfnDCnjHqhmc7VWZbdojP7b3uFJIMw/exec";

const app = {
  userPass: "",
  selectedYear: "",
  records: [],

  // 1. ログイン処理
  async login() {
    this.userPass = document.getElementById("passcode").value;
    this.selectedYear = document.getElementById("select-year").value;

    if (!this.userPass) return alert("合言葉を入力してください");

    // GASからデータを取得してみる（認証を兼ねる）
    const result = await this.fetchFromGAS({ action: "read" });

    if (result.error) {
      alert(result.error);
    } else {
      this.records = result.data;
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("main-screen").style.display = "block";
      document.getElementById("display-year").innerText =
        this.selectedYear + "年度 収支入力";
      document.getElementById("print-year-label").innerText = this.selectedYear;

      // 書き込み権限がない場合は保存ボタンを消す
      if (!result.editable) {
        document.getElementById("btn-save").style.display = "none";
        document.getElementById("edit-mode-badge").innerText =
          "【閲覧専用モード】";
        document.getElementById("edit-mode-badge").style.display = "block";
      }

      this.renderTable();
    }
  },

  // 2. GASとの通信
  async fetchFromGAS(body) {
    // 合言葉と年度を常に付与
    body.passcode = this.userPass;
    body.year = this.selectedYear;

    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return await response.json();
    } catch (e) {
      console.error(e);
      return { error: "通信に失敗しました" };
    }
  },

  // 3. データ保存
  async saveData() {
    const item = document.getElementById("input-item").value;
    const amount = document.getElementById("input-amount").value;
    const date = document.getElementById("input-date").value;

    if (!item || !amount) return alert("入力してください");

    const result = await this.fetchFromGAS({
      action: "write",
      item: item,
      amount: amount,
      date: date,
    });

    if (result.success) {
      alert("保存しました");
      this.resetForm();
      this.login(); // データを再読み込み
    } else {
      alert(result.error);
    }
  },

  // 4. 閲覧用テーブルの描画
  renderTable() {
    const tbody = document.getElementById("report-body");
    tbody.innerHTML = this.records
      .map(
        (row) => `
            <tr>
                <td>${new Date(row[0]).toLocaleDateString()}</td>
                <td>${row[1]}</td>
                <td>${Number(row[2]).toLocaleString()}円</td>
            </tr>
        `
      )
      .join("");
  },

  // 5. タブ切り替え
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
  },

  resetForm() {
    document.getElementById("input-item").value = "";
    document.getElementById("input-amount").value = "";
  },
};
