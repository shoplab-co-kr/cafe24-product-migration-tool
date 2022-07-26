import CustomPuppeteer from "./CustomPuppeteer";
import inquirer from "inquirer";
import path from "path";
import fs from "fs";
import { Logger } from "tslog";
import mkdirp from "mkdirp";

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

class ProductMigrater extends CustomPuppeteer {
  constructor() {
    super();
    this.START_TIMESTAMP = this.getTimestamp();
  }

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
   * Cafe24 로그인 시도 함수
   * @param account
   * @returns
   */
  runCafe24Login = async (account: Cafe24Account) => {
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
  runPasingCafe24Category = async (account: Cafe24Account) => {
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
}

const productMigrater = new ProductMigrater();
export default productMigrater;
