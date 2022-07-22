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
          await productMigrater.runBackupProduct(
            await productMigrater.getCafe24Account()
          );
          break;
        case 1:
          break;
        default:
          throw Error("invaild mode.");
      }
    });
})();
