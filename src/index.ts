import inquirer from "inquirer";
import productMigrater from "./ProductMigrater";

(() => {
  inquirer
    .prompt([
      {
        type: "list",
        name: "mode",
        message: "Cafe24 마이그레이션 툴",
        choices: ["1. 상품 백업", "2. 상품 등록"],
        filter: (val: string) => parseInt(val.split(".")[0]) - 1,
      },
    ])
    .then(async (answers) => {
      switch (answers.mode) {
        case 0:
          const account = await productMigrater.getCafe24Account();
          let condition = await productMigrater.runCafe24Login(account);
          if (condition)
            condition = await productMigrater.runPasingCafe24Category(account);

          break;
        case 1:
          break;
        default:
          throw Error("invaild mode.");
      }
      await productMigrater.closeBrowser();
    });
})();
