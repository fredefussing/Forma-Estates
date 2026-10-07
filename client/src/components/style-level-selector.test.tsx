import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { StyleLevelSelector } from "./style-level-selector";

const languages = ["da", "en", "de", "sv", "nb", "es", "fr"] as const;

test("style level selector renders three translated choices with tier2 selected", async () => {
  for (const language of languages) {
    const locale = JSON.parse(
      readFileSync(`client/src/locales/${language}.json`, "utf8"),
    ) as { dashboard: { budgetTiers: Record<string, string> } };
    const instance = createInstance();
    await instance.init({
      lng: language,
      fallbackLng: false,
      resources: { [language]: { translation: locale } },
    });

    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={instance}>
        <StyleLevelSelector id="style-level-contract" value="tier2" onChange={() => undefined} />
      </I18nextProvider>,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");
    const tiers = locale.dashboard.budgetTiers;

    assert.equal((markup.match(/type="radio"/g) ?? []).length, 3, `${language}: three radio choices`);
    assert.equal((markup.match(/checked=""/g) ?? []).length, 1, `${language}: one selected choice`);
    for (const number of [1, 2, 3]) {
      assert.ok(markup.includes(`value="tier${number}"`), `${language}: tier${number} key remains available`);
      assert.ok(visibleText.includes(tiers[`tier${number}Short`]), `${language}: translated customer label`);
      assert.ok(visibleText.includes(tiers[`tier${number}Sub`]), `${language}: translated description`);
    }
    assert.ok(visibleText.includes(tiers.title), `${language}: translated selector heading`);
    assert.ok(!/\btier\b/i.test(visibleText), `${language}: no internal key name is displayed`);
  }
});

test("both primary generation payloads append the selected key before provider branching", () => {
  const source = readFileSync("client/src/pages/boligpotentiale-dashboard.tsx", "utf8");
  const starts: number[] = [];
  const promptAppend = /fd\.append\("promptText", roomWishes\.trim\(\)\);/g;
  let match: RegExpExecArray | null;
  while ((match = promptAppend.exec(source)) !== null) starts.push(match.index);
  assert.equal(starts.length, 2, "case and standalone upload payloads are covered");

  for (const start of starts) {
    const payloadBranch = source.slice(start, start + 500);
    assert.match(
      payloadBranch,
      /fd\.append\("tier", tier\);\s*if \(imageProvider !== "collov"\)/,
      "selected tier is appended once, outside Collov/OpenAI provider gates",
    );
    assert.doesNotMatch(payloadBranch, /fd\.append\("tier",\s*"tier2"\)/);
  }
});
