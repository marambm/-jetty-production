import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Building2, X } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

function WorkUnitCombobox({ workUnits = [], value, onChange, testId = "select-workunit" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const allValue = value === "All" || value === "" || value == null;
  const displayLabel = allValue ? t("filter.allUnits") : value;

  useEffect(() => {
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      return () => document.removeEventListener("mousedown", handleOutside);
    }
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return workUnits;
    const q = query.toLowerCase();
    return workUnits.filter((u) => u.toLowerCase().includes(q));
  }, [workUnits, query]);

  const handleSelect = (unit) => {
    onChange(unit);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(workUnits.length > 0 && value !== "All" ? "All" : "");
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="h-11 flex items-center gap-2 px-3.5 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-200 hover:border-indigo-400 dark:hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        data-testid={testId}
      >
        <Building2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
        <span className={`flex-1 text-left truncate ${allValue ? "text-gray-400 dark:text-slate-500" : "font-medium"}`}>
          {displayLabel}
        </span>
        {!allValue && (
          <span
            role="button"
            onClick={handleClear}
            className="flex-shrink-0 p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md transition-colors"
            data-testid="button-clear-unit"
          >
            <X className="w-3 h-3 text-gray-400" />
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 w-full min-w-[240px] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl dark:shadow-2xl dark:shadow-black/30 overflow-hidden" data-testid="workunit-dropdown">
          <div className="p-2 border-b border-gray-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("table.search") + "..."}
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                data-testid="input-search-workunit"
              />
            </div>
          </div>

          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            <li
              role="option"
              aria-selected={allValue}
              onClick={() => handleSelect(workUnits.length > 0 ? "All" : "")}
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                allValue
                  ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium"
                  : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
              }`}
              data-testid="option-all-units"
            >
              <Building2 className="w-3.5 h-3.5 opacity-50" />
              {t("filter.allUnits")}
            </li>

            {filtered.map((unit) => (
              <li
                key={unit}
                role="option"
                aria-selected={value === unit}
                onClick={() => handleSelect(unit)}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                  value === unit
                    ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium"
                    : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                }`}
                data-testid={`option-unit-${unit}`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${value === unit ? "bg-indigo-500" : "bg-gray-300 dark:bg-slate-600"}`} />
                {unit}
              </li>
            ))}

            {filtered.length === 0 && query && (
              <li className="px-3 py-4 text-center text-sm text-gray-400 dark:text-slate-500">
                {t("table.noData") || "No results"}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default WorkUnitCombobox;
