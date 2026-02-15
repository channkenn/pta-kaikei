/**
 * @file script.js
 * @description PTA会計アプリのフロントエンドロジック。
 * 普遍的コーディング設計原則に基づき、以下のモジュールに責務を分割しています。
 * - applicationState: アプリケーション全体の状態を一元管理する。
 * - apiService: 外部API（Google Apps Script）との通信責務を完全にカプセル化する。
 * - dataProcessor: UIから独立した、純粋なデータ変換・計算処理を担当する。
 * - uiManager: DOM操作と画面表示の更新というUI層の責務に特化する。
 * - appController: ユーザー操作を起点とし、各モジュールを連携させるアプリケーションの司令塔。
 * - app: HTMLのイベントハンドラから呼び出されるグローバルな公開インターフェース。
 */

const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzT6TAja9-u1ShiuioVlvxLZSoQxMUCpSR5tTSHDfnDCnjHqhmc7VWZbdojP7b3uFJIMw/exec";

// --- 状態管理 (State) ---
// Why: アプリケーション全体で共有されるべき状態（データ）を単一のオブジェクトに集約しています。
//      これにより、状態の変更がどこで発生するのかを予測しやすくなり、データフローの透明性が向上します。
const applicationState = {
  userPasscode: "",
  selectedFiscalYear: "",
  accountingRecords: [],
  isEditable: false,
};

// --- API通信 (Service) ---
// Why: ネットワーク通信は本質的に不安定であり、外部システムへの依存を伴います。
//      この処理を独立したモジュールに分離することで、API仕様の変更や通信エラーハンドリングの修正が必要になった際に、
//      影響範囲をこのオブジェクト内に限定させることができます。
const apiService = {
  async _fetchFromGoogleAppsScript(requestAction, additionalPayload = {}) {
    const requestBody = {
      action: requestAction,
      passcode: applicationState.userPasscode,
      year: applicationState.selectedFiscalYear,
      ...additionalPayload,
    };

    try {
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      // Why: fetch APIの仕様上、4xxや5xx系のHTTPステータスコードはネットワークエラーとは見なされず、catchブロックに移行しません。
      //      そのため、response.okプロパティを明示的にチェックし、サーバーサイドのエラーを能動的に例外として扱う必要があります。
      if (!response.ok) {
        throw new Error(`サーバーからの応答エラー: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("API通信中にエラーが発生しました:", error);
      return {
        error: "通信に失敗しました。ネットワーク接続を確認してください。",
      };
    }
  },

  fetchAllRecords: () => apiService._fetchFromGoogleAppsScript("read"),
  postNewRecord: (recordData) =>
    apiService._fetchFromGoogleAppsScript("write", recordData),
  deleteRecordByRowNumber: (rowNumber) =>
    apiService._fetchFromGoogleAppsScript("delete", { rowNum: rowNumber }),
};

// --- データ処理 (Business Logic) ---
// Why: このモジュールは、アプリケーションのUI（見た目）や通信方法に一切依存しない、純粋なデータ操作ロジックに特化しています。
//      責務をデータ処理に限定することで、ロジックの単体テストが容易になり、将来的に異なるUIやデータソースで再利用することも可能になります。
const dataProcessor = {
  INCOME_ITEM_NAMES: ["前年度繰越金", "本年度会費", "資源回収収益", "決算利息"],

  isIncomeItem(itemName) {
    return this.INCOME_ITEM_NAMES.includes(itemName);
  },

  filterAndSortRecords(records, filterItem, sortOrder) {
    // Why: フィルター条件を複数扱うため、if文で条件を分岐させています。
    //      "ALL"は全件、"_EXPENSES_ONLY_"は支出のみ、それ以外は項目名での完全一致検索として機能します。
    //      この特殊な識別子"_EXPENSES_ONLY_"は、UI上の表示とは独立した、ロジック内部でのみ意味を持つ値です。
    const filteredRecords = records.filter((record) => {
      const itemName = record[2];
      if (filterItem === "ALL") {
        return true;
      }
      if (filterItem === "_EXPENSES_ONLY_") {
        return !this.isIncomeItem(itemName);
      }
      return itemName === filterItem;
    });

    // Why: sortメソッドは元の配列を直接変更（破壊）してしまいます。
    //      予期せぬ副作用を防ぐため、スプレッド構文(...)を用いて配列のシャローコピーを作成し、そのコピーに対してソート処理を実行します。
    return [...filteredRecords].sort((a, b) => {
      const dateA = new Date(a[1]);
      const dateB = new Date(b[1]);
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });
  },

  calculateTotalsFromSelection(checkboxElements) {
    let incomeTotal = 0;
    let expenseTotal = 0;

    checkboxElements.forEach((checkbox) => {
      if (checkbox.checked) {
        const amount = parseFloat(checkbox.dataset.amount);
        const isIncome = checkbox.dataset.income === "true";
        if (isIncome) {
          incomeTotal += amount;
        } else {
          expenseTotal += amount;
        }
      }
    });

    return {
      incomeTotal,
      expenseTotal,
      balance: incomeTotal - expenseTotal,
    };
  },
};

// --- UI操作 (View) ---
// Why: DOMの読み書きやクラスの付け替えなど、画面表示に関するすべての操作をこのモジュールに集約しています。
//      これにより、HTML構造やCSSの変更が必要になった場合でも、修正箇所がこのオブジェクト内に限定され、
//      データ処理などのビジネスロジックに影響を与えることなく、安全にUIの改修を進めることができます。
const uiManager = {
  // Why: DOMクエリは比較的高コストな操作です。頻繁にアクセスする要素を一度だけ取得し、メモリ上に保持（キャッシュ）することで、
  //      アプリケーション全体のパフォーマンスを向上させます。
  domElements: {
    passcode: document.getElementById("passcode"),
    selectYear: document.getElementById("select-year"),
    loginScreen: document.getElementById("login-screen"),
    mainScreen: document.getElementById("main-screen"),
    displayYear: document.getElementById("display-year"),
    viewBody: document.getElementById("view-body"),
    reportBody: document.getElementById("report-body"),
    filterItem: document.getElementById("filter-item"),
    sortOrder: document.getElementById("sort-order"),
    viewTotalIncome: document.getElementById("view-total-income"),
    viewTotalExpense: document.getElementById("view-total-expense"),
    viewTotalBalance: document.getElementById("view-total-balance"),
    printTitleItem: document.getElementById("print-title-item"),
    printTotal: document.getElementById("print-total"),
    contentInput: document.getElementById("content-input"),
    contentView: document.getElementById("content-view"),
    tabInput: document.getElementById("tab-input"),
    tabView: document.getElementById("tab-view"),
  },

  _createViewRowHtml(record) {
    const [rowNumber, dateStr, itemName, details, amountNum, payee, memo] =
      record;
    const displayDate = new Date(dateStr).toLocaleDateString("ja-JP", {
      month: "numeric",
      day: "numeric",
    });
    const amount = Number(amountNum);
    const isIncome = dataProcessor.isIncomeItem(itemName);
    const amountStyle = `color: ${isIncome ? "#0000ff" : "#d32f2f"}; text-align:right; font-weight:bold;`;

    const checkboxHtml = `<input type="checkbox" class="row-checkbox" checked data-amount="${amount}" data-income="${isIncome}" onchange="app.updateTotalsDisplay()">`;
    // Why: 編集権限がある場合にのみ削除ボタンを表示します。これにより、誤操作を防ぎ、UIの安全性を高めます。
    const deleteButtonHtml = applicationState.isEditable
      ? `<button onclick="app.handleDeleteRecord(${rowNumber})" class="btn-delete">削</button>`
      : "";

    return `
      <tr>
        <td>${checkboxHtml}</td>
        <td>${displayDate}</td>
        <td>${itemName}</td>
        <td>${details}</td>
        <td style="${amountStyle}">${amount.toLocaleString()}</td>
        <td>${payee || ""}</td>
        <td>${memo || ""}</td>
        <td>${deleteButtonHtml}</td>
      </tr>`;
  },

  _createPrintRowHtml(record) {
    const [_rowNumber, dateStr, itemName, details, amountNum, payee, memo] =
      record;
    const displayDate = new Date(dateStr).toLocaleDateString("ja-JP");
    const amount = Number(amountNum);
    const amountStyle = `text-align:right;`;

    return `
      <tr>
        <td>${displayDate}</td>
        <td>${itemName}</td>
        <td>${details}</td>
        <td style="${amountStyle}">${amount.toLocaleString()}</td>
        <td>${payee || ""}</td>
        <td>${memo || ""}</td>
      </tr>`;
  },

  getInputDataForNewRecord() {
    return {
      date: document.getElementById("input-date").value,
      item: document.getElementById("input-item").value,
      details: document.getElementById("input-details").value,
      amount: Math.abs(
        parseFloat(document.getElementById("input-amount").value),
      ),
      payee: document.getElementById("input-payee").value,
      memo: document.getElementById("input-memo").value,
    };
  },

  renderAccountingTable() {
    const filterSelect = this.domElements.filterItem;
    const filter = filterSelect.value;
    const sortOrder = this.domElements.sortOrder.value;

    const processedRecords = dataProcessor.filterAndSortRecords(
      applicationState.accountingRecords,
      filter,
      sortOrder,
    );

    const viewRowsHtml = processedRecords
      .map((record) => this._createViewRowHtml(record))
      .join("");
    const printRowsHtml = processedRecords
      .map((record) => this._createPrintRowHtml(record))
      .join("");

    this.domElements.viewBody.innerHTML = viewRowsHtml;
    this.domElements.reportBody.innerHTML = printRowsHtml;
    this.domElements.printTitleItem.innerText =
      filterSelect.options[filterSelect.selectedIndex].text;

    this.updateTotalsDisplay();
  },

  updateTotalsDisplay() {
    const checkboxes = document.querySelectorAll(".row-checkbox");
    const totals = dataProcessor.calculateTotalsFromSelection(checkboxes);

    // 画面上の合計表示は常にすべて表示
    this.domElements.viewTotalIncome.innerText =
      totals.incomeTotal.toLocaleString();
    this.domElements.viewTotalExpense.innerText =
      totals.expenseTotal.toLocaleString();
    this.domElements.viewTotalBalance.innerText =
      totals.balance.toLocaleString();

    // 印刷用の合計表示はフィルター条件によって切り替える
    const filterValue = this.domElements.filterItem.value;

    // Why: フィルターが「すべての項目」の場合のみ収入・残高を含めた全情報を表示します。
    //      それ以外（支出項目での絞り込み時）は、帳票の目的に合わせて支出の合計のみを記載し、情報を簡潔に保ちます。
    if (filterValue === "ALL") {
      this.domElements.printTotal.innerText = `計 収入: ${totals.incomeTotal.toLocaleString()}円 / 支出: ${totals.expenseTotal.toLocaleString()}円 (残高: ${totals.balance.toLocaleString()}円)`;
    } else {
      this.domElements.printTotal.innerText = `支出合計: ${totals.expenseTotal.toLocaleString()}円`;
    }
  },

  switchTab(tabName) {
    const isInputTab = tabName === "input";
    this.domElements.contentInput.style.display = isInputTab ? "block" : "none";
    this.domElements.contentView.style.display = isInputTab ? "none" : "block";
    this.domElements.tabInput.classList.toggle("active", isInputTab);
    this.domElements.tabView.classList.toggle("active", !isInputTab);

    if (!isInputTab) {
      this.renderAccountingTable();
    }
  },

  resetInputForm() {
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

  showMainScreen() {
    this.domElements.loginScreen.style.display = "none";
    this.domElements.mainScreen.style.display = "block";
    this.domElements.displayYear.innerText = `${applicationState.selectedFiscalYear}年度 収支入力`;
  },
};

// --- アプリケーション制御 (Controller) ---
// Why: ユーザーのアクション（例: ボタンクリック）を起点として、どのモジュールのどの機能を、どの順番で呼び出すかを決定する「司令塔」の役割を担います。
//      処理のフローが一箇所に集約されることで、アプリケーション全体の動作を追いやすくなり、ビジネスロジックの変更もここを中心に行うことができます。
const appController = {
  async _reloadDataAndRefreshUI() {
    const result = await apiService.fetchAllRecords();
    if (result.error) {
      alert(result.error);
      return;
    }
    applicationState.accountingRecords = result.data;
    applicationState.isEditable = result.editable;
    uiManager.renderAccountingTable();
  },

  async handleLogin() {
    applicationState.userPasscode = uiManager.domElements.passcode.value;
    applicationState.selectedFiscalYear =
      uiManager.domElements.selectYear.value;
    if (!applicationState.userPasscode) {
      alert("合言葉を入力してください");
      return;
    }

    await this._reloadDataAndRefreshUI();
    uiManager.showMainScreen();
  },

  async handleSaveNewRecord() {
    const newRecordData = uiManager.getInputDataForNewRecord();
    if (
      !newRecordData.item ||
      isNaN(newRecordData.amount) ||
      newRecordData.amount === 0
    ) {
      alert("項目と金額は必須です");
      return;
    }

    const result = await apiService.postNewRecord(newRecordData);
    if (result.success) {
      alert("保存しました");
      uiManager.resetInputForm();
      await this._reloadDataAndRefreshUI();
    } else {
      alert(result.error || "保存に失敗しました。");
    }
  },

  async handleDeleteRecord(rowNumber) {
    if (!confirm("この行を削除してもよろしいですか？")) return;
    const result = await apiService.deleteRecordByRowNumber(rowNumber);
    if (result.success) {
      await this._reloadDataAndRefreshUI();
    } else {
      alert(result.error || "削除に失敗しました。");
    }
  },

  handlePrintReport() {
    const filterSelect = uiManager.domElements.filterItem;
    const itemName = filterSelect.options[filterSelect.selectedIndex].text;
    const originalTitle = document.title;
    document.title = `${applicationState.selectedFiscalYear}年度_${itemName}`;
    window.print();
    // Why: 印刷ダイアログは同期的には動作しません。そのため、少し待ってからタイトルを元に戻すことで、
    //      ユーザーが保存するPDFのファイル名に意図したタイトルが適用される確率を高めます。
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  },

  initializeApplication() {
    uiManager.resetInputForm();
  },
};

// --- グローバルインターフェース ---
// Why: HTMLの`onclick`属性のような伝統的なイベントハンドラは、グローバルスコープに関数を必要とします。
//      この`app`オブジェクトは、モジュール化された内部ロジックとHTMLとを繋ぐ唯一の「公開窓口（Public Interface）」として機能します。
//      これにより、カプセル化を維持しつつ、HTMLとの連携を実現しています。
const app = {
  handleLogin: () => appController.handleLogin(),
  handleSaveNewRecord: () => appController.handleSaveNewRecord(),
  handleDeleteRecord: (rowNumber) =>
    appController.handleDeleteRecord(rowNumber),
  switchTab: (tabName) => uiManager.switchTab(tabName),
  renderAccountingTable: () => uiManager.renderAccountingTable(),
  updateTotalsDisplay: () => uiManager.updateTotalsDisplay(),
  handlePrintReport: () => appController.handlePrintReport(),
};

// アプリケーションの初期化処理を実行
appController.initializeApplication();
