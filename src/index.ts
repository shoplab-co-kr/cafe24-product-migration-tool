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
    .then(async (answers: { mode: number }) => {
      const { mode } = answers;
      const account = await productMigrater.getCafe24Account();
      if (mode === 1) await productMigrater.getCafe24MigrationSetting();

      let condition = await productMigrater.runCafe24Login(account);
      if (mode === 0) {
        if (condition)
          condition = await productMigrater.runPasingCafe24Category(account);
        if (condition)
          condition = await productMigrater.runParsingCafe24ProductCSV(account);
      } else if (mode === 1) {
        if (condition)
          condition = await productMigrater.runMigratingCafe24Category(account);
      } else throw Error("invaild mode.");

      await productMigrater.closeBrowser();
    });
})();
