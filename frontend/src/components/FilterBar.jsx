import { RefreshCw } from "lucide-react";
import CalendarPicker from "./CalendarPicker";
import WorkUnitCombobox from "./WorkUnitCombobox";
import FilterField from "./FilterField";
import { ui } from "./uiStyles";
import { useI18n } from "../i18n/I18nProvider";

function FilterBar({ date, onDateChange, workUnits, selectedUnit, onUnitChange, onQuickRange, onRefresh, children }) {
  const { t } = useI18n();

  return (
    <div className={ui.filterBar} data-testid="filter-bar">
      <div className={ui.filterRow}>
        {date !== undefined && (
          <FilterField label={t("prod.date")}>
            <CalendarPicker value={date} onChange={onDateChange} testId="input-date" />
          </FilterField>
        )}

        {workUnits && (
          <FilterField label={t("filter.allUnits").replace("Toutes les u", "U").replace("All u", "U").split(" ")[0] || "Unit"}>
            <WorkUnitCombobox
              workUnits={workUnits}
              value={selectedUnit}
              onChange={onUnitChange}
              testId="select-workunit"
            />
          </FilterField>
        )}

        {children}

        {onQuickRange && (
          <FilterField label={t("filter.refresh").split(" ")[0] || "Range"} className="flex-none min-w-0 w-auto">
            <div className="flex items-center gap-1.5 h-11">
              <button
                onClick={() => onQuickRange(7)}
                className={ui.btnSmall}
                data-testid="button-range-7d"
              >
                7D
              </button>
              <button
                onClick={() => onQuickRange(30)}
                className={ui.btnSmall}
                data-testid="button-range-30d"
              >
                30D
              </button>
            </div>
          </FilterField>
        )}

        {onRefresh && (
          <FilterField className="flex-none min-w-0 w-auto ml-auto" label={"\u00A0"}>
            <button
              onClick={onRefresh}
              className={ui.btnSecondary}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4" />
              {t("filter.refresh")}
            </button>
          </FilterField>
        )}
      </div>
    </div>
  );
}

export default FilterBar;
