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
const applicationState = {
  userPasscode: "",
  selectedFiscalYear: "",
  accountingRecords: [],
  isEditable: false,
};

// --- API通信 (Service) ---
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
const dataProcessor = {
  INCOME_ITEM_NAMES: [
    "前年度繰越金",
    "本年度会費",
    "資源回収収益",
    "決算利息",
    "その他収入",
  ],
  EXPENSE_ITEM_NAMES: [
    "備品・消耗品費",
    "交流会",
    "お楽しみ会",
    "お泊り会おみやげ",
    "運動会景品",
    "卒園進級記念品代",
    "学年末お礼代",
    "クラス担任アルバム",
    "慶弔費",
    "札幌私立幼稚園PTA連合会会費",
    "日本スポーツ振興センター負担金",
    "幼稚園寄付金",
    "用紙・印刷代",
    "通信費",
    "予備費",
  ],

  isIncomeItem(itemName) {
    return this.INCOME_ITEM_NAMES.includes(itemName);
  },

  filterAndSortRecords(records, filterItem, sortOrder) {
    const filteredRecords = records.filter((record) => {
      const itemName = record[2];
      if (filterItem === "ALL") {
        return true;
      }
      if (filterItem === "_INCOME_ONLY_") {
        return this.isIncomeItem(itemName);
      }
      if (filterItem === "_EXPENSES_ONLY_") {
        return !this.isIncomeItem(itemName);
      }
      return itemName === filterItem;
    });

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

  calculateSummary(records) {
    const incomeMap = new Map();
    this.INCOME_ITEM_NAMES.forEach((item) => incomeMap.set(item, 0));
    const expenseMap = new Map();
    this.EXPENSE_ITEM_NAMES.forEach((item) => expenseMap.set(item, 0));

    records.forEach((record) => {
      const [_row, _date, itemName, _details, amountStr] = record;
      const amount = parseFloat(amountStr);

      if (incomeMap.has(itemName)) {
        incomeMap.set(itemName, incomeMap.get(itemName) + amount);
      } else if (expenseMap.has(itemName)) {
        expenseMap.set(itemName, expenseMap.get(itemName) + amount);
      }
    });

    let totalIncome = 0;
    const incomeSummary = Array.from(incomeMap.entries()).map(
      ([itemName, totalAmount]) => {
        totalIncome += totalAmount;
        return { itemName, totalAmount };
      },
    );

    let totalExpense = 0;
    const expenseSummary = Array.from(expenseMap.entries()).map(
      ([itemName, totalAmount]) => {
        totalExpense += totalAmount;
        return { itemName, totalAmount };
      },
    );

    return {
      incomeSummary,
      expenseSummary,
      totalIncome,
      totalExpense,
      finalBalance: totalIncome - totalExpense,
    };
  },
};

// --- UI操作 (View) ---
const uiManager = {
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
    summaryPrintTitleIncome: document.getElementById(
      "summary-print-title-income",
    ),
    summaryPrintTitleExpense: document.getElementById(
      "summary-print-title-expense",
    ),
    summaryIncomeBody: document.getElementById("summary-income-body"),
    summaryTotalIncome: document.getElementById("summary-total-income"),
    summaryExpenseBody: document.getElementById("summary-expense-body"),
    summaryTotalExpense: document.getElementById("summary-total-expense"),
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

  renderSummaryReport(summaryData) {
    const createRow = (item) =>
      `<tr><td>${item.itemName}</td><td>${item.totalAmount.toLocaleString()}</td></tr>`;

    this.domElements.summaryIncomeBody.innerHTML = summaryData.incomeSummary
      .map(createRow)
      .join("");
    this.domElements.summaryExpenseBody.innerHTML = summaryData.expenseSummary
      .map(createRow)
      .join("");

    this.domElements.summaryTotalIncome.innerText =
      summaryData.totalIncome.toLocaleString();
    this.domElements.summaryTotalExpense.innerText =
      summaryData.totalExpense.toLocaleString();

    const titleText = `${applicationState.selectedFiscalYear}年度 収支報告書`;
    this.domElements.summaryPrintTitleIncome.innerText = titleText;
    this.domElements.summaryPrintTitleExpense.innerText = titleText;
  },

  updateTotalsDisplay() {
    const checkboxes = document.querySelectorAll(".row-checkbox");
    const totals = dataProcessor.calculateTotalsFromSelection(checkboxes);

    this.domElements.viewTotalIncome.innerText =
      totals.incomeTotal.toLocaleString();
    this.domElements.viewTotalExpense.innerText =
      totals.expenseTotal.toLocaleString();
    this.domElements.viewTotalBalance.innerText =
      totals.balance.toLocaleString();

    const filterValue = this.domElements.filterItem.value;
    const isIncomeFilter =
      filterValue === "_INCOME_ONLY_" ||
      dataProcessor.INCOME_ITEM_NAMES.includes(filterValue);

    if (filterValue === "ALL") {
      this.domElements.printTotal.innerText = `選択計 収入: ${totals.incomeTotal.toLocaleString()}円 / 支出: ${totals.expenseTotal.toLocaleString()}円 (残高: ${totals.balance.toLocaleString()}円)`;
    } else if (isIncomeFilter) {
      this.domElements.printTotal.innerText = `選択収入合計: ${totals.incomeTotal.toLocaleString()}円`;
    } else {
      this.domElements.printTotal.innerText = `選択支出合計: ${totals.expenseTotal.toLocaleString()}円`;
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

    document.body.classList.add("printing-details");
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
      document.body.classList.remove("printing-details");
    }, 1000);
  },

  handlePrintSummaryReport() {
    const summaryData = dataProcessor.calculateSummary(
      applicationState.accountingRecords,
    );
    uiManager.renderSummaryReport(summaryData);

    const originalTitle = document.title;
    document.title = `${applicationState.selectedFiscalYear}年度_収支報告書`;

    document.body.classList.add("printing-summary");
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
      document.body.classList.remove("printing-summary");
    }, 1000);
  },

  initializeApplication() {
    uiManager.resetInputForm();
  },
};

// --- グローバルインターフェース ---
const app = {
  handleLogin: () => appController.handleLogin(),
  handleSaveNewRecord: () => appController.handleSaveNewRecord(),
  handleDeleteRecord: (rowNumber) =>
    appController.handleDeleteRecord(rowNumber),
  switchTab: (tabName) => uiManager.switchTab(tabName),
  renderAccountingTable: () => uiManager.renderAccountingTable(),
  updateTotalsDisplay: () => uiManager.updateTotalsDisplay(),
  handlePrintReport: () => appController.handlePrintReport(),
  handlePrintSummaryReport: () => appController.handlePrintSummaryReport(),
};

appController.initializeApplication();
