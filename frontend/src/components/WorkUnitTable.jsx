import { useState } from "react";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import StatusBadge from "./StatusBadge";
import { useI18n } from "../i18n/I18nProvider";

function deriveStatusColor(row) {
  if (row.statusColor) return row.statusColor;
  const total = row.productionTotal || 0;
  const good = row.goodQty || 0;
  const quality = total > 0 ? (good / total) * 100 : 100;
  if (quality < 95) return "red";
  if (quality < 98) return "orange";
  return "green";
}

function WorkUnitTable({ data, onRowClick }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);
  const perPage = 10;

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  let filtered = data.filter((row) =>
    row.workUnit.toLowerCase().includes(search.toLowerCase())
  );

  if (sortKey) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-gray-400 dark:text-slate-500 inline ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-indigo-500 inline ml-1" />
      : <ChevronDown className="w-3 h-3 text-indigo-500 inline ml-1" />;
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-800 overflow-hidden" data-testid="section-table">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100" data-testid="text-table-title">{t("table.title")}</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder={t("table.search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            data-testid="input-table-search"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left" data-testid="table-work-units">
          <thead className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 uppercase text-xs tracking-wider">
            <tr>
              <th className="px-6 py-3 font-semibold">{t("table.workUnit")}</th>
              <th className="px-6 py-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("productionTotal")} data-testid="th-sort-production">
                {t("table.production")} <SortIcon col="productionTotal" />
              </th>
              <th className="px-6 py-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("goodQty")} data-testid="th-sort-good">
                {t("kpi.goodPieces")} <SortIcon col="goodQty" />
              </th>
              <th className="px-6 py-3 font-semibold text-right cursor-pointer select-none" onClick={() => handleSort("defectsQty")} data-testid="th-sort-defects">
                {t("kpi.losses")} <SortIcon col="defectsQty" />
              </th>
              <th className="px-6 py-3 font-semibold">{t("table.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {paged.map((row, idx) => {
              const losses = (row.defectsQty || 0) + (row.scrapQty || 0);
              const color = deriveStatusColor(row);

              return (
                <tr
                  key={row.workUnit}
                  className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  onClick={() => onRowClick && onRowClick(row.workUnit)}
                  data-testid={`row-work-unit-${idx}`}
                >
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-slate-100" data-testid={`text-work-unit-name-${idx}`}>
                    {row.workUnit}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700 dark:text-slate-300" data-testid={`text-work-unit-production-${idx}`}>
                    {row.productionTotal?.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700 dark:text-slate-300" data-testid={`text-work-unit-good-${idx}`}>
                    {(row.goodQty ?? 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700 dark:text-slate-300" data-testid={`text-work-unit-losses-${idx}`}>
                    {losses}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge color={color} />
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400 dark:text-slate-500 text-sm">
                  {t("table.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-sm text-gray-500 dark:text-slate-400">
          <span>{t("table.page")} {page + 1} / {totalPages}</span>
          <div className="flex gap-1.5">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 transition-colors"
              data-testid="button-page-prev"
            >
              {t("table.prev")}
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 transition-colors"
              data-testid="button-page-next"
            >
              {t("table.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkUnitTable;
