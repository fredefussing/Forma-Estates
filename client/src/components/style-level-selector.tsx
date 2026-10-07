import React from "react";
import { useTranslation } from "react-i18next";

type StyleLevel = "tier1" | "tier2" | "tier3";

const levels: Array<{ value: StyleLevel; label: string; description: string }> = [
  {
    value: "tier1",
    label: "dashboard.budgetTiers.tier1Short",
    description: "dashboard.budgetTiers.tier1Sub",
  },
  {
    value: "tier2",
    label: "dashboard.budgetTiers.tier2Short",
    description: "dashboard.budgetTiers.tier2Sub",
  },
  {
    value: "tier3",
    label: "dashboard.budgetTiers.tier3Short",
    description: "dashboard.budgetTiers.tier3Sub",
  },
];

export function StyleLevelSelector({
  value,
  onChange,
  id = "style-level",
}: {
  value: string;
  onChange: (value: StyleLevel) => void;
  id?: string;
}) {
  const { t } = useTranslation();

  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-[#0F1D2F]">
        {t("dashboard.budgetTiers.title")}
      </legend>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-[#77716B]">
        {t("dashboard.budgetTiers.helper")}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {levels.map((level) => {
          const selected = value === level.value;
          return (
            <label
              key={level.value}
              className={`relative flex min-w-0 cursor-pointer rounded-xl border px-3.5 py-3 transition-colors focus-within:ring-2 focus-within:ring-[#C8956C] focus-within:ring-offset-2 ${
                selected
                  ? "border-[#0F1D2F] bg-[#F3F1ED]"
                  : "border-[#E2DED8] bg-white hover:border-[#B9B2A9]"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name={id}
                value={level.value}
                checked={selected}
                onChange={() => onChange(level.value)}
                aria-label={`${t(level.label)}. ${t(level.description)}`}
                data-testid={`${id}-${level.value}`}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-semibold leading-tight text-[#0F1D2F]">
                  {t(level.label)}
                </span>
                <span className="text-xs leading-relaxed text-[#77716B]">
                  {t(level.description)}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`ml-2 mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border ${
                  selected
                    ? "border-[4px] border-[#C8956C] bg-white"
                    : "border-[#C9C3BB] bg-white"
                }`}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
