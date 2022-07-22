import puppeteer from "puppeteer";
import inquirer from "inquirer";

interface Cafe24Account {
  id: string;
  password: string;
}

interface Cafe24AccountGetter {
  (): Promise<Cafe24Account>;
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
   * 선택자 요소를 클릭하는 함수
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
    await page.waitForSelector("#mall_id");
    await page.type("#mall_id", account.id);
    await page.waitForSelector("#userpasswd");
    await page.type("#userpasswd", account.password);
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
    const options = await inquirer.prompt([
      {
        type: "list",
        name: "data-form",
        message: "상품백업 액셀파일 양식선택",
        choices: [
          "1. 기본양식",
          "2. 에디봇 기본양식",
          "3. 옵션/재고 초기화 양식",
        ],
        filter: (val: string) => parseInt(val.split(".")[0]),
      },
    ]);

    const cafe24Browser = await this.runCafe24Login(account);
    if (!cafe24Browser) throw Error("failed cafe24 login.");

    const { browser, page } = cafe24Browser;

    await page.goto(
      `https://${account.id}.cafe24.com/disp/admin/product/productmanage`
    );
    await this.clickElement(page, ".setting .eExcelCreateRequestPopUp");
  };
}

const productMigrater = new ProductMigrater();
export default productMigrater;
