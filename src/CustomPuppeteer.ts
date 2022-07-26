import puppeteer from "puppeteer";

export default class CustomPuppeteer {
  constructor() {}

  private readonly DEFAULT_USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36";

  private readonly DEFAULT_WAIT_OPTIONS: puppeteer.WaitForOptions = {
    waitUntil: "networkidle2",
  };

  private browser: puppeteer.Browser | null = null;

  /**
   * Puppeteer 브라우저 객체와 페이지 객체를 얻는 함수
   * @returns
   */
  protected getPuppeteer = async () => {
    if (!this.browser)
      this.browser = await puppeteer.launch({ headless: false });
    const page = await this.browser.newPage();
    await page.setUserAgent(this.DEFAULT_USER_AGENT);

    return { browser: this.browser, page };
  };

  /**
   * 선택자 요소를 마우스 클릭하는 함수
   * @param page
   * @param selector
   */
  protected clickWithWait = async (page: puppeteer.Page, selector: string) => {
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
  protected clickToOpenPopup = async (
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
  protected setSelectBoxOption = async (
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
  protected setCheckBoxValue = async (
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
  protected typeToElement = async (
    page: puppeteer.Page,
    selector: string,
    text: string
  ) => {
    await page.waitForSelector(selector);
    await page.type(selector, text);
  };

  protected waitForDownload = async (browser: puppeteer.Browser) => {
    const dmPage = await browser.newPage();
    await dmPage.goto("chrome://downloads/");

    await dmPage.bringToFront();
    await dmPage.waitForFunction(
      () => {
        try {
          const donePath = document
            .querySelector("downloads-manager")!
            .shadowRoot!.querySelector("#frb0")!
            .shadowRoot!.querySelector("#pauseOrResume")!;
          if ((donePath as HTMLButtonElement).innerText != "Pause") {
            return true;
          }
        } catch {
          //
        }
      },
      { timeout: 0 }
    );
    console.log("Download finished");
  };
}
