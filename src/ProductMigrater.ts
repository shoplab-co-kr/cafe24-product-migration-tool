import path from "path";
import fs, { read, write } from "fs";

import CustomPuppeteer from "./CustomPuppeteer";
import cheerio from "cheerio";
import inquirer from "inquirer";
import { Logger } from "tslog";
import mkdirp from "mkdirp";
import unzipper from "unzipper";
import { parse } from "csv-parse";
import axios from "axios";
import ProgressBar from "progress";

interface Cafe24Account {
  id: string;
  password: string;
}

interface Cafe24AccountGetter {
  (): Promise<Cafe24Account>;
}

interface Cafe24ProductCategory {
  no: number;
  title: string;
  description: string;
  showCategory: boolean;
  showMainCategory: boolean;
  showPC: boolean;
  showMobile: boolean;
  showSoldout: boolean;
  showChildProduct: boolean;
  productSector: string;
  allowRobot: boolean;
  seoTitle: string;
  seoAuthor: string;
  seoDescription: string;
  seoKeywords: string;
  childCategory: Array<Cafe24ProductCategory>;
}

interface Cafe24ProductCategoryParsingData {
  dimension: number;
  data: Cafe24ProductCategory;
}

interface Cafe24Migrater {
  (account: Cafe24Account): Promise<boolean>;
}

interface Cafe24ProductImages {
  detailArticle: { [key: string]: string[] };
  product: {
    big: { [key: string]: string[] };
    extra: { [key: string]: string[] };
    medium: { [key: string]: string[] };
    small: { [key: string]: string[] };
    tiny: { [key: string]: string[] };
  };
}

class ProductMigrater extends CustomPuppeteer {
  constructor() {
    super();
    this.START_TIMESTAMP = this.getTimestamp();
  }

  private readonly MIGRATION_DATA_PATH = path.join(
    __dirname,
    "..",
    ".migration"
  );

  private readonly MIGRATION_FORM_NAME = "마이그레이션양식";

  private readonly MIGRATION_FORM_PASSWORD = "testtest1234";

  private readonly MIGRATION_FORM_ITEM = [
    "product_code",
    // "empty_space",
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

  private MIGRATION_PACKAGE_NAME: string | null = null;

  private MIGRATION_CATEGORY_PREFIX: string | null = null;

  private readonly START_TIMESTAMP: string;

  private readonly log = new Logger();
  readonly printInfoLog = (label: string, msg: string) =>
    this.log.info(`[${label}] : ${msg}`);
  readonly printErrLog = (label: string, msg: string) =>
    this.log.error(`[${label}] : ${msg}`);

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
   * 특정 계정의 마이그레이션데이터 저장 경로를 얻는 함수
   * @param id
   * @returns
   */
  private getMigrationUserDirPath = (id: string) =>
    path.join(this.MIGRATION_DATA_PATH, `${id}_${this.START_TIMESTAMP}`);

  /**
   * 단일 파일을 지정된 경로에 다운로드 하는 함수
   * @param url
   * @param path
   * @returns
   */
  private _donwloadFile = async (url: string, path: string) => {
    console.log(`Connecting [${url}]...`);
    return axios({ url, method: "GET", responseType: "stream" }).then(
      (response) => {
        return new Promise((resolve, reject) => {
          const totalLength = response.headers["content-length"];

          console.log("Start download");
          const progressBar = new ProgressBar(
            "--> downloading [:bar] :percent :etas",
            {
              width: 40,
              complete: "=",
              incomplete: " ",
              renderThrottle: 1,
              total: parseInt(totalLength),
            }
          );

          const writeStream = fs.createWriteStream(path);
          response.data.on("data", (chunk: any) => {
            progressBar.tick(chunk.length);
          });
          response.data.pipe(writeStream);

          let error: any = null;
          writeStream.on("error", (err) => {
            error = err;
            writeStream.close();
            reject(err);
          });
          writeStream.on("close", () => {
            if (!error) {
              resolve(true);
            }
          });
        });
      }
    );
  };

  /**
   * HTTP 요청으로 파일들을 지정된 경로에 다운로드 받는 함수
   * @param urls
   * @param savePath
   * @returns
   */
  downloadFiles = async (urls: string[], savePath: string) => {
    const downloads: any = [];
    return mkdirp(savePath)
      .then(async () => {
        for (let url of urls) {
          const splitedURL = url.split("/");
          const fileName = splitedURL[splitedURL.length - 1];
          downloads.push(
            this._donwloadFile(url, path.join(savePath, fileName))
          );
        }
        return Promise.all(downloads);
      })
      .catch((e) => {
        console.log(e);
      });
  };

  /**
   * 지정된 경로의 CSV 파일 읽기 스트림을 얻는 함수
   * @param path
   * @returns
   */
  private readCSVFile = (path: string) => {
    return fs.createReadStream(path).pipe(
      parse({
        columns: true,
        delimiter: ",",
        trim: false,
        skip_empty_lines: true,
      })
    );
  };

  /**
   * 브라우저를 종료하는 함수
   */
  closeBrowser = async () => {
    const { browser } = await this.getPuppeteer();
    await browser.close();
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
   * Cafe24 마이그레이션 세팅 값을 입력받아 맴버 변수에 대입하는 함수
   */
  getCafe24MigrationSetting = async () => {
    const packages: string[] = [];
    fs.readdirSync(this.MIGRATION_DATA_PATH, { withFileTypes: true }).forEach(
      (p) => {
        if (p.isDirectory()) packages.push(p.name);
      }
    );
    const setting = (await inquirer.prompt([
      {
        type: "list",
        name: "package",
        choices: packages,
        message: "파싱된 마이그레이션 패키지 선택:",
      },
      {
        type: "input",
        name: "prefix",
        message: "마이그레이션될 카테고리의 접두사:",
      },
    ])) as { package: string; prefix: string };

    this.MIGRATION_PACKAGE_NAME = setting.package;
    this.MIGRATION_CATEGORY_PREFIX = setting.prefix;
  };

  /**
   * Cafe24 로그인 시도 함수
   * @param account
   * @returns
   */
  runCafe24Login: Cafe24Migrater = async (account: Cafe24Account) => {
    const logLabel = "runCafe24Login";
    this.printInfoLog(logLabel, `Start cafe24 login - ${account.id}`);

    const { browser, page } = await this.getPuppeteer();

    // Cafe24 EC 관리자 페이지 로그인 시도
    await page.goto("https://eclogin.cafe24.com/Shop/");
    await this.typeToElement(page, "#mall_id", account.id);
    await this.typeToElement(page, "#userpasswd", account.password);
    await this.clickWithWait(page, "#frm_user > div > div.mButton > button");

    if (
      page.url() ===
      "https://user.cafe24.com/comLogin/?action=comForce&req=hosting"
    ) {
      await page.waitForSelector("#iptBtnEm");
      await page.click("#iptBtnEm");
      await page.waitForNavigation();
    }

    let successFlag: boolean;
    if (
      page.url() ===
      `https://${account.id}.cafe24.com/disp/admin/shop1/mode/dashboard?`
    ) {
      await page.goto(`https://${account.id}.cafe24.com/admin/php/main.php`);
      this.printInfoLog(logLabel, `Successed cafe24 login - ${account.id}`);
      successFlag = true;
    } else {
      this.printErrLog(logLabel, `Failed cafe24 login - ${account.id}`);
      successFlag = false;
    }

    await page.close();
    return successFlag;
  };

  /**
   * Cafe24 상품분류 파싱 시도 함수
   * @param account
   */
  runPasingCafe24Category: Cafe24Migrater = async (account: Cafe24Account) => {
    const logLabel = "runCafe24Login";
    this.printInfoLog(
      logLabel,
      `Start parsing cafe24 category - ${account.id}`
    );

    const { browser, page } = await this.getPuppeteer();

    // 상품분류 설정 페이지 접근
    await page.goto(
      `https://${account.id}.cafe24.com/disp/admin/product/categorymanage`
    );
    await page.waitForNetworkIdle();

    // 상품분류트리 확장
    await page.waitForSelector("#eUnrollCategoryBtn");
    await page.$eval("#eUnrollCategoryBtn", (ele: any) => {
      ele.click();
    });
    await page.waitForTimeout(100);

    try {
      // 상품분류의 차수를 얻는 함수를 페이지 내에 선언
      await page.evaluate(() => {
        (window as any).getCategoryDimension = (_ele: any) => {
          let i = 0;
          let ele = (window as any).$(_ele);
          while (!ele.hasClass("dynatree-container")) {
            ele = ele.parent();
            if (ele.attr("id").match(/^category-[0-9]+$/)) i += 1;
          }
          return i;
        };
      });

      // 상품분류정보 파싱 시작
      const categoryDatas: Array<Cafe24ProductCategory> = [];
      const categoryElements = await page.$$(
        `.dynatree-container li[id^="category-"]`
      );
      for (const ele of categoryElements) {
        // 상품분류 선택 활성화
        await ele.evaluate((ele: any) => ele.dtnode.activate());
        await page.waitForSelector(
          `.dynatree-loading[style^="display: none;"]`
        );

        // 상품분류정보 가져와 배열의 알맞은 위치에 삽입
        const { dimension, data } = await ele.evaluate(
          (ele: any): Cafe24ProductCategoryParsingData => {
            const _w = window as any;
            return {
              dimension: _w.getCategoryDimension(ele),
              data: {
                no: parseInt(
                  _w.$("#eCategoryUrlOpen").text().split("cate_no=")[1]
                ),
                title: _w.$("#eCategoryTitle").val(),
                description: _w.$("#eCategoryDescription").val(),
                showCategory:
                  _w.$(`input[name="is_display[1]"]:checked`).val() === "T"
                    ? true
                    : false,
                showMainCategory:
                  _w.$(`input[name="is_main[1]"]:checked`).val() === "T"
                    ? true
                    : false,
                showPC: Boolean(_w.$(".eSelected #eDisplayTypeP").length),
                showMobile: Boolean(_w.$(".eSelected #eDisplayTypeM").length),
                showSoldout:
                  _w.$(`input[name="show_soldout"]:checked`).val() === "N"
                    ? true
                    : false,
                showChildProduct:
                  _w.$(`input[name="show_sub_category"]:checked`).val() === "T"
                    ? true
                    : false,
                productSector: _w.$("#eProductClearanceTextbox").val(),
                allowRobot:
                  _w.$(`input[name="search_engine_exposure"]:checked`).val() ===
                  "T"
                    ? true
                    : false,
                seoTitle: _w.$("#meta_title").val(),
                seoAuthor: _w.$("#meta_author").val(),
                seoDescription: _w.$("#meta_description").val(),
                seoKeywords: _w.$("#meta_keywords").val(),
                childCategory: [],
              },
            };
          }
        );
        let tmp = categoryDatas;
        for (let i = 0; i < dimension; i++) {
          tmp = tmp[tmp.length - 1].childCategory;
        }
        tmp.push(data);
      }

      // 상품분류정보배열을 JSON파일로 저장
      const migrationUserDirPath = this.getMigrationUserDirPath(account.id);
      const categoryJSONFilePath = path.join(
        migrationUserDirPath,
        "category.json"
      );
      await mkdirp(migrationUserDirPath);
      fs.writeFileSync(categoryJSONFilePath, JSON.stringify(categoryDatas));

      await page.close();
      this.printInfoLog(
        logLabel,
        `Successed parsing cafe24 category - parsed ${categoryElements.length} categories [saved ${categoryJSONFilePath}]`
      );
      return true;
    } catch (e) {
      await page.close();
      this.printErrLog(logLabel, "Failed parsing cafe24 category...");
      return false;
    }
  };

  /**
   * Cafe24 상품정보 CSV를 다운로드 받고 파싱하는 함수
   * @param account
   * @returns
   */
  runParsingCafe24ProductCSV: Cafe24Migrater = async (
    account: Cafe24Account
  ) => {
    const logLabel = "runParsingCafe24ProductCSV";
    this.printInfoLog(
      logLabel,
      `Start parsing cafe24 product csv - ${account.id}`
    );

    const { browser, page } = await this.getPuppeteer();
    const userMigrationDir = this.getMigrationUserDirPath(account.id);

    // Cafe24 상품 CSV 다운로드 팝업 접근
    await page.goto(
      `https://${account.id}.cafe24.com/disp/admin/product/productmanage`
    );
    const csvDownloadPopup = await this.clickToOpenPopup(
      browser,
      page,
      ".btnNormal.eExcelCreateRequestPopUp"
    );

    // Cafe24 상품 CSV 다운로드 위치 설정
    const csvDownloadPopupClient = await csvDownloadPopup
      .target()
      .createCDPSession();
    await csvDownloadPopupClient.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: userMigrationDir,
    });

    // Cafe24 상품 CSV 다운로드 팝업의 다이얼로그 처리 정의
    let csvDownloadPopupCloseFlag = false;
    csvDownloadPopup.on("dialog", async (dialog) => {
      await dialog.accept();
      if (csvDownloadPopupCloseFlag) await page.close();
    });

    // 마이그레이션용 CSV 양식이 존재하는지 검사 후 미등록 시 양식 등록
    await csvDownloadPopup.waitForSelector("#aManagesList > option");
    if (
      !(await csvDownloadPopup.$(
        `#aManagesList > option[id^="${this.MIGRATION_FORM_NAME}"]`
      ))
    ) {
      const formSettingPopup = await this.clickToOpenPopup(
        browser,
        csvDownloadPopup,
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
        this.MIGRATION_FORM_NAME
      );

      for (let item of this.MIGRATION_FORM_ITEM) {
        if (item !== "empty_space") {
          await formSettingPopup.click(`option[data-id="${item}"]`);
          await formSettingPopup.click(".mController .icoRight");
        } else {
          await formSettingPopup.click(".mController .icoBlank");
        }
      }
      await formSettingPopup.click("#ManageDataSave");
      await formSettingPopup.waitForTimeout(500);
    }

    // CSV 파일 다운로드를 위한 정보 입력 및 다운로드요청 버튼 클릭
    await this.setSelectBoxOption(
      csvDownloadPopup,
      "#aManagesList",
      (await csvDownloadPopup.$eval(`#${this.MIGRATION_FORM_NAME}`, (ele) =>
        ele.getAttribute("value")
      )) as string
    );
    await this.typeToElement(
      csvDownloadPopup,
      "#Password",
      this.MIGRATION_FORM_PASSWORD
    );
    await this.typeToElement(
      csvDownloadPopup,
      "#PasswordConfirm",
      this.MIGRATION_FORM_PASSWORD
    );
    await this.clickWithWait(csvDownloadPopup, ".btnStrong.excelSubmit");

    // CSV 생성완료 대기 및 CSV 다운로드
    await csvDownloadPopup.waitForSelector(
      "#QA_common_password2 tbody tr:nth-of-type(1) .btnNormal.eModal"
    );
    csvDownloadPopupCloseFlag = true;
    await csvDownloadPopup.click(
      "#QA_common_password2 tbody tr:nth-of-type(1) .btnNormal.eModal"
    );
    await this.typeToElement(
      csvDownloadPopup,
      "#ConfirmLayer #password",
      this.MIGRATION_FORM_PASSWORD
    );
    await csvDownloadPopup.waitForSelector("#excel_download");
    await csvDownloadPopup.click("#excel_download");

    // 파일 다운로드 대기 및 다운로드된 파일명 획득
    let csvFileName = "";
    await mkdirp(userMigrationDir);
    while (true) {
      const dir = fs.readdirSync(userMigrationDir);
      for (let fileName of dir) {
        if (fileName.match(/^[0-9|a-z]+\.zip$/)) {
          csvFileName = fileName;
          break;
        }
      }
      if (csvFileName !== "") break;
    }

    // 다운로드된 암호화 CSV 압축파일을 압축해제 후 파싱
    const unzipedCSVFile = await unzipper.Open.file(
      path.join(userMigrationDir, csvFileName)
    ).then(
      async (dir) => await dir.files[0].buffer(this.MIGRATION_FORM_PASSWORD)
    );
    fs.writeFileSync(
      path.join(userMigrationDir, "product.csv"),
      unzipedCSVFile.toString()
    );
    const CSVFileStream = this.readCSVFile(
      path.join(userMigrationDir, "product.csv")
    );
    const CSVFileContent: any[] = [];
    const cafe24ProductImages: Cafe24ProductImages = {
      detailArticle: {},
      product: {
        big: {},
        extra: {},
        medium: {},
        small: {},
        tiny: {},
      },
    };

    for await (const record of CSVFileStream) {
      record["상품코드"] = "";

      const $ = cheerio.load(record["상품 상세설명"]);
      $("img")
        .toArray()
        .forEach((ele, idx) => {
          const imgSrc = $(ele).attr("src");
          const dateDir = imgSrc?.split("/")[4];
          if (dateDir) {
            if (!(dateDir in cafe24ProductImages.detailArticle)) {
              cafe24ProductImages.detailArticle[dateDir] = [];
            }
            cafe24ProductImages.detailArticle[dateDir].push(
              `https://${account.id}.cafe24.com${imgSrc}`
            );
          }
        });
      const bigImgURL = record["이미지등록(상세)"].trim();
      if (bigImgURL !== "") {
        if (!(bigImgURL.split("/")[0] in cafe24ProductImages.product.big)) {
          cafe24ProductImages.product.big[bigImgURL.split("/")[0]] = [];
        }
        cafe24ProductImages.product.big[bigImgURL.split("/")[0]].push(
          `https://${account.id}.cafe24.com/web/product/big/${bigImgURL}`
        );
      }

      const mediumImgURL = record["이미지등록(목록)"].trim();
      if (mediumImgURL !== "") {
        if (
          !(mediumImgURL.split("/")[0] in cafe24ProductImages.product.medium)
        ) {
          cafe24ProductImages.product.medium[mediumImgURL.split("/")[0]] = [];
        }
        cafe24ProductImages.product.medium[mediumImgURL.split("/")[0]].push(
          `https://${account.id}.cafe24.com/web/product/medium/${mediumImgURL}`
        );
      }

      const tinyImgURL = record["이미지등록(작은목록)"].trim();
      if (tinyImgURL !== "") {
        if (!(tinyImgURL.split("/")[0] in cafe24ProductImages.product.tiny)) {
          cafe24ProductImages.product.tiny[tinyImgURL.split("/")[0]] = [];
        }
        cafe24ProductImages.product.tiny[tinyImgURL.split("/")[0]].push(
          `https://${account.id}.cafe24.com/web/product/tiny/${tinyImgURL}`
        );
      }

      const smallImgURL = record["이미지등록(축소)"].trim();
      if (smallImgURL !== "") {
        if (!(smallImgURL.split("/")[0] in cafe24ProductImages.product.small)) {
          cafe24ProductImages.product.small[smallImgURL.split("/")[0]] = [];
        }
        cafe24ProductImages.product.small[smallImgURL.split("/")[0]].push(
          `https://${account.id}.cafe24.com/web/product/small/${smallImgURL}`
        );
      }

      const extraImgURL = record["이미지등록(추가)"].trim();
      if (extraImgURL !== "") {
        for (let url of extraImgURL.split("|")) {
          if (!(url.split("/")[0] in cafe24ProductImages.product.extra)) {
            cafe24ProductImages.product.extra[url.split("/")[0]] = [];
          }
          cafe24ProductImages.product.extra[url.split("/")[0]].push(
            `https://${account.id}.cafe24.com/web/product/extra/big/${url}`
          );
        }
      }

      CSVFileContent.push(record);
    }

    fs.writeFileSync(
      path.join(userMigrationDir, "imageUrls.json"),
      JSON.stringify(cafe24ProductImages)
    );

    this.printInfoLog(logLabel, "Start Download detailArticle Images...");
    for (let key of Object.keys(cafe24ProductImages.detailArticle)) {
      await this.downloadFiles(
        cafe24ProductImages.detailArticle[key],
        path.join(
          this.getMigrationUserDirPath(account.id),
          "images",
          "web",
          "upload",
          "NNEditor",
          key
        )
      );
    }
    this.printInfoLog(logLabel, "Start Download product big Images...");
    for (let key of Object.keys(cafe24ProductImages.product.big)) {
      await this.downloadFiles(
        cafe24ProductImages.product.big[key],
        path.join(
          this.getMigrationUserDirPath(account.id),
          "images",
          "web",
          "product",
          "big",
          key
        )
      );
    }
    this.printInfoLog(logLabel, "Start Download product medium Images...");
    for (let key of Object.keys(cafe24ProductImages.product.medium)) {
      await this.downloadFiles(
        cafe24ProductImages.product.medium[key],
        path.join(
          this.getMigrationUserDirPath(account.id),
          "images",
          "web",
          "product",
          "medium",
          key
        )
      );
    }
    this.printInfoLog(logLabel, "Start Download product small Images...");
    for (let key of Object.keys(cafe24ProductImages.product.small)) {
      await this.downloadFiles(
        cafe24ProductImages.product.small[key],
        path.join(
          this.getMigrationUserDirPath(account.id),
          "images",
          "web",
          "product",
          "small",
          key
        )
      );
    }
    this.printInfoLog(logLabel, "Start Download product tiny Images...");
    for (let key of Object.keys(cafe24ProductImages.product.tiny)) {
      await this.downloadFiles(
        cafe24ProductImages.product.tiny[key],
        path.join(
          this.getMigrationUserDirPath(account.id),
          "images",
          "web",
          "product",
          "tiny",
          key
        )
      );
    }
    this.printInfoLog(logLabel, "Start Download product extra Images...");
    for (let key of Object.keys(cafe24ProductImages.product.extra)) {
      await this.downloadFiles(
        cafe24ProductImages.product.extra[key],
        path.join(
          this.getMigrationUserDirPath(account.id),
          "images",
          "web",
          "product",
          "extra",
          key
        )
      );
    }

    await csvDownloadPopup.close();
    await page.close();
    this.printInfoLog(
      logLabel,
      `Success parsing cafe24 product csv - ${account.id}`
    );
    return true;
  };

  /**
   * 파싱된 Cafe24 카테고리를 Cafe24 쇼핑몰에 마이그레이션 시도 함수
   * @param account
   * @returns
   */
  runMigratingCafe24Category: Cafe24Migrater = async (
    account: Cafe24Account
  ) => {
    const logLabel = "runParsingCafe24ProductCSV";
    this.printInfoLog(
      logLabel,
      `Start migrating cafe24 category - ${account.id}`
    );

    if (!this.MIGRATION_PACKAGE_NAME || !this.MIGRATION_CATEGORY_PREFIX) {
      this.printErrLog(logLabel, "invaild migration settings.");
      return false;
    }

    try {
      // 마이그레이션 패키지 내 카테고리 정보 가져오기
      const categories: Array<Cafe24ProductCategory> = JSON.parse(
        fs
          .readFileSync(
            path.join(
              this.MIGRATION_DATA_PATH,
              this.MIGRATION_PACKAGE_NAME,
              "category.json"
            )
          )
          .toString()
      );

      const { browser, page } = await this.getPuppeteer();

      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });

      // 상품분류 관리 페이지 접근
      await page.goto(
        `https://${account.id}.cafe24.com/disp/admin/product/categorymanage`
      );
      await page.waitForSelector(".gLeft .btnNormal.eAddLargeCategoryBtn");
      await page.waitForTimeout(1000);

      const CSVFileStream = fs
        .createReadStream(
          path.join(
            this.MIGRATION_DATA_PATH,
            this.MIGRATION_PACKAGE_NAME,
            "product.csv"
          )
        )
        .pipe(
          parse({
            columns: true,
            delimiter: ",",
            trim: false,
            skip_empty_lines: true,
          })
        );
      const CSVFileContent: any = [];
      for await (const record of CSVFileStream) {
        record["상품코드"] = "";
        CSVFileContent.push(record);
      }

      /**
       * 상품정보 CSV파일 내의 상품분류 번호를 변경하는 함수
       * @param target
       * @param data
       */
      const replaceCSVCategoryNumber = (target: string, data: string) => {
        CSVFileContent.forEach((record: any, idx: number) => {
          record["상품분류 번호"].replace(new RegExp(target, "g"), data);
        });
      };

      /**
       * 상품분류의 정보를 설정하는 함수
       * @param category
       */
      const setCategoryData = async (category: Cafe24ProductCategory) => {
        const $ = cheerio.load(await page.content());
        const categoryNumber = $("#eCategoryUrlOpen")
          .text()
          .split("cate_no=")[1];
        replaceCSVCategoryNumber(category.no.toString(), categoryNumber);
        await page.type("#eCategoryDescription", category.description);
        if (category.showCategory) await page.click("#eRaidoDisplayStatusT");
        else await page.click("#eRaidoDisplayStatusF");
        if (category.showMainCategory) await page.click("#eRaidoDisplayMainT");
        else await page.click("#eRaidoDisplayMainF");
        if (category.showPC && !(await page.$(".eSelected #eDisplayTypeP")))
          await page.click("#eDisplayTypeP");
        if (category.showMobile && !(await page.$(".eSelected #eDisplayTypeM")))
          await page.click("#eDisplayTypeM");
        if (category.showSoldout) await page.click("#eShowSoldoutN");
        else await page.click("#eShowSoldoutB");
        if (category.showChildProduct)
          await page.click("#eRadioDisplaySubCategoryT");
        else await page.click("#eRadioDisplaySubCategoryF");
        await page.type("#eProductClearanceTextbox", category.productSector);
        if (category.allowRobot) await page.click("#isSearchEngineExposureT");
        else await page.click("#isSearchEngineExposureF");
        await page.type("#meta_title", category.seoTitle);
        await page.type("#meta_author", category.seoAuthor);
        await page.type("#meta_description", category.seoDescription);
        await page.type("#meta_keywords", category.seoKeywords);
        await page.click("#eSubmitBtn");
        await page.waitForTimeout(1000);
      };

      /**
       * 하위 상품분류를 생성하는 함수
       * @param parentCategory
       * @param dimension
       */
      const createChildCategory = async (
        parentCategory: Cafe24ProductCategory,
        dimension: number
      ) => {
        for (let category of parentCategory.childCategory) {
          await page.evaluate((dimension) => {
            const _$ = (window as any).$;
            if ((window as any).categoryParentEles[dimension] === null) {
              const categoryEles: any = document.querySelectorAll(
                ".dynatree-container li"
              );
              const parentNode = categoryEles[categoryEles.length - 1].dtnode;
              parentNode.adder();
              (window as any).categoryParentEles[dimension] = parentNode;
              _$("#eUnrollCategoryBtn").click();
            } else {
              (window as any).categoryParentEles[dimension].adder();
              _$("#eUnrollCategoryBtn").click();
            }
          }, dimension);
          await page.waitForSelector("#editNode");
          await page.type(
            "#editNode",
            `[${this.MIGRATION_CATEGORY_PREFIX} / ${this.START_TIMESTAMP}] ${category.title}`
          );
          await page.keyboard.press("Enter");
          await page.waitForSelector(
            `.dynatree-loading[style^="display: none;"]`
          );

          await setCategoryData(category);

          if (category.childCategory.length !== 0)
            await createChildCategory(category, dimension + 1);
        }
        for (let i = dimension; i < 3; i++) {
          await page.evaluate((i) => {
            (window as any).categoryParentEles[i] = null;
          }, i);
        }
      };

      // 계층별 부모 상품분류 객체 배열 선언
      await page.evaluate(() => {
        (window as any).categoryParentEles = [null, null, null];
      });

      // 상품분류 생성
      for (let category of categories) {
        await page.click(".gLeft .btnNormal.eAddLargeCategoryBtn");
        await page.waitForSelector("#editNode");
        await page.type(
          "#editNode",
          `[${this.MIGRATION_CATEGORY_PREFIX} / ${this.START_TIMESTAMP}] ${category.title}`
        );
        await page.keyboard.press("Enter");
        await page.waitForSelector(
          `.dynatree-loading[style^="display: none;"]`
        );

        await setCategoryData(category);

        if (category.childCategory.length !== 0)
          await createChildCategory(category, 0);
      }

      this.printInfoLog(
        logLabel,
        `Successed migrating cafe24 category - ${account.id}`
      );
      return true;
    } catch (e) {
      this.printErrLog(
        logLabel,
        `Failed migrating cafe24 category - ${account.id}`
      );
      return false;
    }
  };
}

const productMigrater = new ProductMigrater();
export default productMigrater;
