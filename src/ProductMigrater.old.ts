import puppeteer from "puppeteer";
import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import mkdirp from "mkdirp";
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

  /**
   * Cafe24 로그인 페이지 URL
   */
  private readonly CAFE24_EC_LOGIN_URL = "https://eclogin.cafe24.com/Shop/";

  /**
   * Puppeteer 기본 user agent
   */
  private readonly BROWSER_USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36";

  /**
   * Puppeteer 기본 대기옵션
   */
  private readonly DEFAULT_WAIT_OPTIONS: puppeteer.WaitForOptions = {
    waitUntil: "networkidle2",
  };

  private readonly MIGRATION_DATA_PATH = path.join(".", ".migration");

  private readonly MIGRATION_FORM_ITEM = [
    "product_code",
    "ma_product_code",
    "is_display",
    "is_selling",
    "category_no",
    "display_group_3",
    "display_group_2",
    "product_name",
    "eng_product_name",
    "item_name",
    "purchase_prd_name",
    "prd_model",
    "p_summary_contents",
    "p_pr_contents",
    "pa_detail_info",
    "mobile_detail_info_display",
    "mobile_detail_info",
    "product_tag",
    "product_tax_type",
    "product_custom",
    "product_buy",
    "prd_price_org",
    "product_price",
    "product_price_type",
    "product_price_content",
    "order_limit_type",
    "product_min",
    "product_max",
    "mileage_value",
    "mileage_type",
    "common_event_exposure",
    "is_adult",
    "has_option",
    "option_type",
    "item_listing_type",
    "option_set_name",
    "option_value_serial",
    "option_display_type_serial",
    "option_button_image",
    "option_color",
    "necessary",
    "soldout_display_text",
    "option_add",
    "add_option_name",
    "add_option_tf_serial",
    "text_length",
    "image_big",
    "image_medium",
    "image_tiny",
    "image_small",
    "image_add",
    "manufacturer_code",
    "supplier_id",
    "brand_code",
    "trend_code",
    "classification_code",
    "print_date",
    "release_date",
    "use_expiration_date",
    "expiration_date",
    "origin_place_no",
    "volume_size_serial",
    "payment_info",
    "shipping_info",
    "exchange_info",
    "cs_info",
    "use_individual_ship_config",
    "delivery_method",
    "delvtype",
    "delivery_place",
    "delivery_cost_prepaid",
    "delivery_period",
    "ship_type",
    "ship_fee",
    "use_store_pickup",
    "product_weight",
    "hscode",
    "clearance_category_code",
    "product_material",
    "product_material_eng",
    "cloth_fabric",
    "seo_search_engine_exposure",
    "seo_title",
    "seo_meta_author",
    "seo_meta_description",
    "meta_tag",
    "seo_alt_tag",
    "individual_payment_method",
    "supplier_trading_type_code",
    "product_memo",
  ];

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
   * 디렉토리 내 가장 최신 파일을 얻는 함수
   * @param dir
   * @returns
   */
  private getMostRecentFile = (dir: string) => {
    const files = fs.readdirSync(dir);
    let j = files.length;
    for (let i = 0; i < j; i++) {
      if (
        !files[i].match(/^[a-z|A-Z|0-9]{1}.+\..+$/) ||
        !fs.lstatSync(path.join(dir, files[i])).isFile()
      ) {
        files.splice(i, 1);
        j -= 1;
      }
    }

    files
      .map((file) => ({
        file,
        mtime: fs.lstatSync(path.join(dir, file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return files.length ? files[0] : undefined;
  };

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

  private waitForDownload = async (browser: puppeteer.Browser) => {
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
    // Cafe24 로그인 브라우저 생성
    const cafe24Browser = await this.runCafe24Login(account);
    if (!cafe24Browser) throw Error("failed cafe24 login.");
    const { browser, page } = cafe24Browser;

    // 이전 마이그레이션 정보 JSON 파싱
    if (!fs.existsSync(this.MIGRATION_DATA_PATH))
      mkdirp(this.MIGRATION_DATA_PATH).catch(() => {
        throw Error("Can not created migration data folder.");
      });
    let userMigrationData: MigrationJSONData;
    try {
      userMigrationData = JSON.parse(
        fs.readFileSync(
          path.join(this.MIGRATION_DATA_PATH, `${account.id}.json`),
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
    const downloadPopup = await this.clickToOpenPopup(
      browser,
      page,
      ".setting .eExcelCreateRequestPopUp"
    );

    const downloadPopupClient = await downloadPopup.target().createCDPSession();
    downloadPopup.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await downloadPopupClient.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: this.MIGRATION_DATA_PATH,
    });

    // 엑셀 다운로드 양식관리에 마이그레이션용양식 추가
    await downloadPopup.waitForSelector(
      "#QA_common_password1 #aManagesList option"
    );
    const excelFormOptions = await downloadPopup.$$eval(
      "#QA_common_password1 #aManagesList option",
      (e) => e.map((x) => x.getAttribute("value"))
    );
    if (excelFormOptions.indexOf("마이그레이션용양식") === -1) {
      const formSettingPopup = await this.clickToOpenPopup(
        browser,
        downloadPopup,
        "#QA_common_password1 .excelManage"
      );
      formSettingPopup.on("dialog", async (dialog) => {
        dialog.accept();
        await formSettingPopup.close();
      });
      await this.setSelectBoxOption(
        formSettingPopup,
        "#QA_common_download1 #aManagesList",
        "newManage"
      );
      await formSettingPopup.waitForNavigation();

      await this.typeToElement(
        formSettingPopup,
        "#sManageNewName",
        "마이그레이션용양식"
      );

      for (let item of this.MIGRATION_FORM_ITEM) {
        await formSettingPopup.click(`option[data-id="${item}"]`);
        await formSettingPopup.click(".mController .icoRight");
      }
      await formSettingPopup.click("#ManageDataSave");
    }

    await downloadPopup.waitForTimeout(1000);
    await this.setSelectBoxOption(
      downloadPopup,
      "#aManagesList",
      "마이그레이션용양식"
    );
    await downloadPopup.waitForTimeout(1000);
    await this.typeToElement(
      downloadPopup,
      "#Password",
      userMigrationData.password
    );
    await this.typeToElement(
      downloadPopup,
      "#PasswordConfirm",
      userMigrationData.password
    );

    await this.setCheckBoxValue(downloadPopup, "#data_option", true);
    await this.clickElement(downloadPopup, "#QA_common_password1 .excelSubmit");
    await downloadPopup.waitForSelector(
      "#QA_common_password2 tbody tr:nth-of-type(1) .eModal:nth-of-type(1)"
    );
    await downloadPopup.click(
      "#QA_common_password2 tbody tr:nth-of-type(1) .eModal:nth-of-type(1)",
      { delay: 2000 }
    );
    await this.typeToElement(
      downloadPopup,
      "#ConfirmLayer #password",
      userMigrationData.password
    );
    await downloadPopup.waitForSelector("#excel_download");
    await downloadPopup.click("#excel_download");
    await downloadPopup
      .waitForNetworkIdle()
      .then(async () => {
        const fileName = this.getMostRecentFile(this.MIGRATION_DATA_PATH);
        if (!fileName) throw Error("Failed file download...");
        fs.renameSync(
          path.join(this.MIGRATION_DATA_PATH, fileName),
          path.join(this.MIGRATION_DATA_PATH, `${account.id}_${fileName}`)
        );
        console.log("Success donwload file!");

        await downloadPopup.close();
        await page.close();
        await browser.close();
      })
      .catch((e) => {
        Promise.all([
          downloadPopup.close(),
          page.close(),
          browser.close(),
        ]).then(() => {
          throw Error("Failed file download...");
        });
      });
  };
}

const productMigrater = new ProductMigrater();
export default productMigrater;
