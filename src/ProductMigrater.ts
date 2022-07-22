import puppeteer from "puppeteer";
import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

interface Cafe24Account {
  id: string;
  password: string;
}

interface Cafe24AccountGetter {
  (): Promise<Cafe24Account>;
}

interface MigrationJSONData {
  default: Array<any>;
  edibot: Array<any>;
  reset: Array<any>;
  password: string;
}

class ProductMigrater {
  constructor() {}

  private readonly CAFE24_EC_LOGIN_URL = "https://eclogin.cafe24.com/Shop/";
  private readonly BROWSER_USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36";
  private readonly DEFAULT_WAIT_OPTIONS: puppeteer.WaitForOptions = {
    waitUntil: "networkidle2",
  };

  /**
   * 타임스템프를 반환하는 함수
   * @returns
   */
  private getTimestamp = () =>
    new Date(+new Date() + 3240 * 10000)
      .toISOString()
      .replace("T", " ")
      .replace(/\..*/, "");

  /**
   * Cafe24 계정을 입력 받아 반환하는 함수
   * @returns
   */
  getCafe24Account: Cafe24AccountGetter = async () => {
    return await inquirer.prompt([
      {
        type: "input",
        name: "id",
        message: "로그인할 Cafe24 계정 ID를 입력해주세요:",
      },
      {
        type: "password",
        name: "password",
        message: "로그인할 Cafe24 계정 Password를 입력해주세요:",
      },
    ]);
  };

  /**
   * 선택자 요소를 마우스 클릭하는 함수
   * @param page
   * @param selector
   */
  private clickElement = async (page: puppeteer.Page, selector: string) => {
    await page.waitForSelector(selector);
    await Promise.all([
      page.click(selector),
      page.waitForNavigation(this.DEFAULT_WAIT_OPTIONS),
    ]);
  };

  /**
   * 팝업 윈도우가 발생하는 선택자 요소를 마우스 클릭하는 함수
   * @param browser
   * @param page
   * @param selector
   */
  private clickToOpenPopup = async (
    browser: puppeteer.Browser,
    page: puppeteer.Page,
    selector: string
  ) => {
    await page.waitForSelector(selector);
    await page.click(selector);
    const popup: puppeteer.Page = await new Promise((x) =>
      browser.once("targetcreated", (target) => x(target.page()))
    );
    return popup;
  };

  /**
   * 셀렉트박스 요소의 옵션을 선택하는 함수
   * @param page
   * @param selector
   */
  private setSelectBoxOption = async (
    page: puppeteer.Page,
    selector: string,
    option: string
  ) => {
    await page.waitForSelector(selector);
    await page.select(selector, option);
  };

  /**
   * 체크박스 요소의 값을 설정하는 함수
   * @param page
   * @param selector
   * @param value
   */
  private setCheckBoxValue = async (
    page: puppeteer.Page,
    selector: string,
    value: boolean
  ) => {
    const checkbox = await page.$(selector);
    if (checkbox) {
      const checkboxValue = (await (
        await checkbox.getProperty("checked")
      ).jsonValue()) as boolean;

      if (checkboxValue !== value) await page.click(selector);
    }
  };

  /**
   * 선택자 요소에 인자로 전달된 텍스트를 키보드 입력하는 함수
   * @param page
   * @param selector
   * @param text
   */
  private typeToElement = async (
    page: puppeteer.Page,
    selector: string,
    text: string
  ) => {
    await page.waitForSelector(selector);
    await page.type(selector, text);
  };

  /**
   * Cafe24 로그인을 시도하는 함수
   * @param account
   * @returns
   */
  private runCafe24Login = async (account: Cafe24Account) => {
    console.log(`puppeteer start: ${this.getTimestamp()}`);
    console.log("start cafe24 login...");

    const browser = await puppeteer.launch({
      headless: false,
    });
    const page = await browser.newPage();
    await page.setUserAgent(this.BROWSER_USER_AGENT);
    await page.on("dialog", async (dialog) => {
      await dialog.dismiss();
      await page.keyboard.press("Escape");
    });

    // Cafe24 EC 관리자 페이지 로그인 시도
    await page.goto(this.CAFE24_EC_LOGIN_URL);
    await this.typeToElement(page, "#mall_id", account.id);
    await this.typeToElement(page, "#userpasswd", account.password);
    await this.clickElement(page, "#frm_user > div > div.mButton > button");

    if (
      page.url() ===
      `https://${account.id}.cafe24.com/disp/admin/shop1/mode/dashboard?`
    ) {
      page.evaluate(function () {
        (
          window as any
        ).NEW_PRO_MODE_MENU_NAGIVATION_GNB.onClickNewProModeDashboardModalClose();
      });
      await this.clickElement(
        page,
        ".changeModeToggle .ec-influencer-gnb-mode-change"
      );
      console.log(`Successed cafe24 Login : ${account.id}`);
      return { browser, page };
    } else {
      await page.close();
      await browser.close();
      return undefined;
    }
  };

  /**
   * 상품백업함수
   */
  runBackupProduct = async (account: Cafe24Account) => {
    // 상품백업 옵션 선택
    const backupOptions = await inquirer.prompt([
      {
        type: "list",
        name: "data-form",
        message: "상품백업 액셀파일 양식선택",
        choices: [
          "1. 기본양식",
          "2. 에디봇 기본양식",
          "3. 옵션/재고 초기화 양식",
        ],
        filter: (val: string) => val.split(". ")[1],
      },
      {
        type: "checkbox",
        name: "data-option",
        message: "옵션선택",
        choices: ["상품명 HTML 태그 삭제"],
      },
    ]);

    // Cafe24 로그인 브라우저 생성
    const cafe24Browser = await this.runCafe24Login(account);
    if (!cafe24Browser) throw Error("failed cafe24 login.");
    const { browser, page } = cafe24Browser;

    // 이전 마이그레이션 정보 JSON 파싱
    let userMigrationData: MigrationJSONData;
    try {
      userMigrationData = JSON.parse(
        fs.readFileSync(
          path.join("..", ".migration", `${account.id}.json`),
          "utf-8"
        )
      );
    } catch (e) {
      userMigrationData = {
        default: [],
        edibot: [],
        reset: [],
        // password: Buffer.from(uuid(), "utf-8")
        //   .toString("base64")
        //   .substring(0, 16),
        password: "test1234TEST",
      };
    }

    // 상품목록 엑셀다운로드
    console.log("Start download product excel file...");
    await page.goto(
      `https://${account.id}.cafe24.com/disp/admin/product/productmanage`
    );
    const popup = await this.clickToOpenPopup(
      browser,
      page,
      ".setting .eExcelCreateRequestPopUp"
    );
    const popupClient = await popup.target().createCDPSession();
    popup.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await popupClient.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: ".",
    });

    await this.setSelectBoxOption(
      popup,
      "#aManagesList",
      backupOptions["data-form"]
    );
    await this.typeToElement(popup, "#Password", userMigrationData.password);
    await this.typeToElement(
      popup,
      "#PasswordConfirm",
      userMigrationData.password
    );

    await this.setCheckBoxValue(
      popup,
      "#data_option",
      backupOptions["data-option"].indexOf("상품명 HTML 태그 삭제") !== -1
    );
    // await this.clickElement(popup, "#QA_common_password1 .excelSubmit");
    await popup.waitForSelector(
      "#QA_common_password2 tbody tr:nth-of-type(1) .eModal:nth-of-type(1)"
    );
    await popup.click(
      "#QA_common_password2 tbody tr:nth-of-type(1) .eModal:nth-of-type(1)",
      { delay: 2000 }
    );
    await this.typeToElement(
      popup,
      "#ConfirmLayer #password",
      userMigrationData.password
    );
    await popup.waitForSelector("#excel_download");
    await popup.click("#excel_download");
  };
}

const productMigrater = new ProductMigrater();
export default productMigrater;
